use anyhow::{bail, Context, Result};
use ogg::reading::PacketReader;
use opus_rs::OpusDecoder;
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::{get_codecs, get_probe};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const OPUS_SAMPLE_RATE: u32 = 48_000;
const MAX_OPUS_FRAME_SAMPLES: usize = 5_760;
const MAX_FILE_BYTES: u64 = 1_024 * 1_024 * 1_024;
const MAX_DURATION_SECONDS: f64 = 4.0 * 60.0 * 60.0;

/// Audio decoded for the speech-to-text engines: mono, normalized, and 16 kHz.
pub struct DecodedAudio {
    pub samples: Vec<f32>,
    pub duration_seconds: f64,
}

pub fn decode_file_for_transcription(path: &Path) -> Result<DecodedAudio> {
    let metadata = std::fs::metadata(path)
        .with_context(|| format!("Could not read audio file metadata: {}", path.display()))?;
    if !metadata.is_file() {
        bail!("The selected path is not a file");
    }
    if metadata.len() > MAX_FILE_BYTES {
        bail!("The selected file is larger than 1 GB");
    }

    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    if matches!(extension.as_deref(), Some("ogg") | Some("opus")) {
        if let Some(decoded) = decode_ogg_opus(path)? {
            return Ok(decoded);
        }
    }

    let mut hint = Hint::new();
    if let Some(extension) = extension.as_deref() {
        hint.with_extension(extension);
    }

    let file = File::open(path)
        .with_context(|| format!("Could not open audio file: {}", path.display()))?;
    let media_source = MediaSourceStream::new(Box::new(file), Default::default());
    let probed = get_probe()
        .format(
            &hint,
            media_source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .with_context(|| format!("Unsupported or invalid audio file: {}", path.display()))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .context("The audio file does not contain a usable audio track")?;
    let track_id = track.id;
    let mut decoder = get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .context("This audio codec is not supported")?;

    let mut source_sample_rate = None;
    let mut mono_samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::ResetRequired) => {
                bail!("The audio stream requires an unsupported decoder reset")
            }
            Err(error) => return Err(error).context("Could not decode the audio stream"),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => return Err(error).context("Could not decode the audio stream"),
        };
        let spec = *decoded.spec();
        let sample_rate = spec.rate;
        if source_sample_rate.is_some_and(|current| current != sample_rate) {
            bail!("The audio file changes sample rate mid-stream")
        }
        source_sample_rate = Some(sample_rate);

        let channels = spec.channels.count();
        if channels == 0 {
            bail!("The audio stream has no channels")
        }

        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        mono_samples.extend(downmix_interleaved(buffer.samples(), channels));
    }

    let source_sample_rate =
        source_sample_rate.context("The audio file contains no decodable samples")?;
    decoded_audio(mono_samples, source_sample_rate)
}

/// Decode Telegram-style OGG Opus recordings. Symphonia intentionally does not
/// include an Opus codec, so OGG/Vorbis continues through its normal path.
fn decode_ogg_opus(path: &Path) -> Result<Option<DecodedAudio>> {
    let file = File::open(path)
        .with_context(|| format!("Could not open audio file: {}", path.display()))?;
    let mut reader = PacketReader::new(file);
    let Some(header) = reader
        .read_packet()
        .context("Could not read the OGG stream")?
    else {
        bail!("The OGG file is empty")
    };

    if !header.data.starts_with(b"OpusHead") {
        return Ok(None);
    }

    let (channels, mut pre_skip) = parse_opus_header(&header.data)?;
    let stream_serial = header.stream_serial();
    let mut decoder = OpusDecoder::new(OPUS_SAMPLE_RATE as i32, channels)
        .map_err(|error| anyhow::anyhow!("Could not create Opus decoder: {error}"))?;
    let mut mono_samples = Vec::new();

    while let Some(packet) = reader
        .read_packet()
        .context("Could not read an OGG Opus packet")?
    {
        if packet.stream_serial() != stream_serial
            || packet.data.starts_with(b"OpusTags")
            || packet.data.starts_with(b"OpusHead")
        {
            continue;
        }

        let mut decoded = vec![0.0_f32; MAX_OPUS_FRAME_SAMPLES * channels];
        let samples_per_channel = decoder
            .decode(&packet.data, MAX_OPUS_FRAME_SAMPLES, &mut decoded)
            .map_err(|error| anyhow::anyhow!("Could not decode Opus audio: {error}"))?;
        let samples = downmix_interleaved(&decoded[..samples_per_channel * channels], channels);

        if pre_skip >= samples.len() {
            pre_skip -= samples.len();
        } else {
            mono_samples.extend_from_slice(&samples[pre_skip..]);
            pre_skip = 0;
        }
    }

    decoded_audio(mono_samples, OPUS_SAMPLE_RATE).map(Some)
}

fn parse_opus_header(header: &[u8]) -> Result<(usize, usize)> {
    if header.len() < 19 || !header.starts_with(b"OpusHead") {
        bail!("The OGG Opus header is invalid")
    }

    let channels = header[9] as usize;
    if !(1..=2).contains(&channels) {
        bail!("Only mono and stereo OGG Opus files are supported")
    }
    if header[18] != 0 {
        bail!(
            "OGG Opus channel mapping family {} is not supported",
            header[18]
        )
    }

    let pre_skip = u16::from_le_bytes([header[10], header[11]]) as usize;
    Ok((channels, pre_skip))
}

fn decoded_audio(mono_samples: Vec<f32>, source_sample_rate: u32) -> Result<DecodedAudio> {
    let duration_seconds = mono_samples.len() as f64 / source_sample_rate as f64;
    if duration_seconds > MAX_DURATION_SECONDS {
        bail!("The selected file is longer than four hours")
    }

    Ok(DecodedAudio {
        samples: resample_to_16khz(&mono_samples, source_sample_rate),
        duration_seconds,
    })
}

fn downmix_interleaved(samples: &[f32], channels: usize) -> Vec<f32> {
    samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / channels as f32)
        .collect()
}

fn resample_to_16khz(samples: &[f32], source_sample_rate: u32) -> Vec<f32> {
    if source_sample_rate == TARGET_SAMPLE_RATE || samples.len() < 2 {
        return samples.to_vec();
    }

    let target_len = ((samples.len() as u64 * TARGET_SAMPLE_RATE as u64)
        / source_sample_rate as u64)
        .max(1) as usize;
    let ratio = source_sample_rate as f64 / TARGET_SAMPLE_RATE as f64;

    (0..target_len)
        .map(|index| {
            let position = index as f64 * ratio;
            let lower = position.floor() as usize;
            let upper = (lower + 1).min(samples.len() - 1);
            let fraction = (position - lower as f64) as f32;
            samples[lower] + (samples[upper] - samples[lower]) * fraction
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{downmix_interleaved, parse_opus_header, resample_to_16khz};

    #[test]
    fn downmix_averages_each_interleaved_frame() {
        let mono = downmix_interleaved(&[0.25, 0.75, -1.0, 1.0], 2);
        assert_eq!(mono, vec![0.5, 0.0]);
    }

    #[test]
    fn resampler_returns_the_target_sample_count() {
        let source = vec![0.0; 48_000];
        assert_eq!(resample_to_16khz(&source, 48_000).len(), 16_000);
    }

    #[test]
    fn resampler_keeps_16khz_audio_unchanged() {
        let source = vec![0.1, -0.2, 0.3];
        assert_eq!(resample_to_16khz(&source, 16_000), source);
    }

    #[test]
    fn parses_mono_opus_header_and_preskip() {
        let mut header = b"OpusHead".to_vec();
        header.extend_from_slice(&[1, 1, 0x80, 0x00, 0, 0, 0, 0, 0, 0, 0]);

        assert_eq!(parse_opus_header(&header).unwrap(), (1, 128));
    }

    #[test]
    fn rejects_multichannel_opus_mapping() {
        let mut header = b"OpusHead".to_vec();
        header.extend_from_slice(&[1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

        assert!(parse_opus_header(&header).is_err());
    }

    #[test]
    #[ignore = "requires VOICE_EVERYWHERE_TEST_AUDIO with a local OGG Opus fixture"]
    fn decodes_external_opus_fixture() {
        let path = std::env::var("VOICE_EVERYWHERE_TEST_AUDIO")
            .expect("VOICE_EVERYWHERE_TEST_AUDIO must point to a local audio file");
        let decoded = super::decode_file_for_transcription(std::path::Path::new(&path))
            .expect("audio fixture should decode");

        assert!(decoded.duration_seconds > 0.0);
        assert!(!decoded.samples.is_empty());
        assert!(decoded.samples.iter().all(|sample| sample.is_finite()));
        let expected_samples = (decoded.duration_seconds * 16_000.0).round() as usize;
        assert!(decoded.samples.len().abs_diff(expected_samples) <= 1);
    }
}
