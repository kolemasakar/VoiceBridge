class VoiceBridgeCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const duration = options.processorOptions?.frameDurationMs || 20;
    this.targetSamples = Math.max(1, Math.round(sampleRate * duration / 1000));
    this.frame = new Float32Array(this.targetSamples);
    this.offset = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0 || channels[0].length === 0) {
      return true;
    }

    const sampleCount = channels[0].length;
    for (let index = 0; index < sampleCount; index += 1) {
      let mixed = 0;
      for (const channel of channels) {
        mixed += channel[index] || 0;
      }
      this.frame[this.offset] = mixed / channels.length;
      this.offset += 1;

      if (this.offset === this.targetSamples) {
        const completed = this.frame;
        this.port.postMessage(completed, [completed.buffer]);
        this.frame = new Float32Array(this.targetSamples);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("voicebridge-capture-processor", VoiceBridgeCaptureProcessor);
