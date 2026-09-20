class VidyaAudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (input) {
      const samples = new Float32Array(input);
      this.port.postMessage(samples, [samples.buffer]);
    }

    if (output) {
      output.fill(0);
    }

    return true;
  }
}

registerProcessor("vidya-audio-processor", VidyaAudioProcessor);
