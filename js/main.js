const canvas = document.getElementById('Canvas');
const context = canvas.getContext('2d');

const FPS = 60;
const log2DataSize = 11;
const dataSize = 2 ** log2DataSize;
var waveData;
var duration;
var time = performance.now();

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const audioPlayer = document.getElementById('audioPlayer');

function disableScroll() {
  document.body.style.overflow = 'hidden';
};

disableScroll();

function init() {
  const input = document.getElementById('fileInput');
  input.addEventListener('change', (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      audioPlayer.src = URL.createObjectURL(file);;
      const audioContext = new AudioContext();

      let decodeFunction;
      switch (file.type) {
        case 'audio/wav':
          decodeFunction = audioContext.decodeAudioData;
          break;
        case 'audio/mp3':
        case 'audio/mpeg':
        case 'audio/m4a':
          decodeFunction = audioContext.decodeAudioData.bind(audioContext, event.target.result);
          break;
        case 'audio/ogg':
          decodeFunction = audioContext.decodeAudioData.bind(audioContext, event.target.result);
          break;
        default:
          throw new Error(`Unsupported file type: ${file.type}`);
      }

      decodeFunction((buffer) => {
        const channelData = buffer.getChannelData(0);
        duration = buffer.duration;
        let audioData = [];
        for (let i = 0; i < channelData.length; i ++) {
          audioData.push(channelData[i]);
        }
        waveData = audioData;
      });
      
    }
    reader.readAsArrayBuffer(file);
  });
};

function setData(audioData, time, audioLength) {
  let data = [];
  let now = Math.trunc(time * audioData.length / audioLength + 0.5);
  for (let i = 0; i < dataSize; i++) {
    data.push(windowFunction(i / (dataSize - 1)) * audioData[now + i]);
  }
  return data;
}

function windowFunction(x) {
  return 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x);
}

function reverseBit(num, b) {
  let tmp = num;
  let res = tmp & 1;
  for (let i = 1; i < b; i++) {
      tmp >>= 1;
      res = (res << 1) | (tmp & 1);
  }
  return res;
}


function FFT(data) {
  let Fi = Array(data.length).fill(0);
  let Fr = [];
  for (let i = 0; i < data.length; i++) {
    Fr.push(data[reverseBit(i, Math.trunc(Math.log(data.length) / Math.log(2) + 0.5))]);
  }
  let windowSize = 1;
  while (windowSize < data.length) {
    windowSize *= 2;
    for (let i = 0; i < data.length; i++) {
      if (i % windowSize < windowSize / 2) {
        let k = i + windowSize / 2;
        let wiR = Math.cos(-2 * Math.PI * (i % windowSize) / windowSize);
        let wiI = Math.sin(-2 * Math.PI * (i % windowSize) / windowSize);
        let wkR = Math.cos(-2 * Math.PI * (k % windowSize) / windowSize);
        let wkI = Math.sin(-2 * Math.PI * (k % windowSize) / windowSize);
        [Fr[i], Fi[i], Fr[k], Fi[k]] = [Fr[i] + wiR * Fr[k] - wiI * Fi[k], Fi[i] + wiI * Fr[k] + wiR * Fi[k], Fr[i] + wkR * Fr[k] - wkI * Fi[k], Fi[i] + wkI * Fr[k] + wkR * Fi[k]];
      }
    }
  }
  return [Fr, Fi];
}

function getSpectrum(data) {
  let F = FFT(data);
  let spectrum = [];
  for (let i = 0; i < data.length; i++) {
    spectrum.push((F[0][i] ** 2 + F[1][i] ** 2) * 5);
  }
  return spectrum;
}

function draw(data) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "Blue";
  context.lineWidth = 2;
  let spectrum = getSpectrum(data);
  for (let i = 0; i < data.length / 2; i++) {
    context.beginPath();
    context.moveTo(canvas.width / 2 + (i - data.length / 4) * 0.5, canvas.height / 2 + 100);
    context.lineTo(canvas.width / 2 + (i - data.length / 4) * 0.5, canvas.height / 2 + 100 - spectrum[i]);
    context.stroke();
  }
}

let intervalId;

function startInterval() {
  intervalId = setInterval(() => {
    let now = (performance.now() - time) / 1000
    draw(setData(waveData, now, duration));
  }, 1000 / FPS);
}

function stopInterval() {
  clearInterval(intervalId);
}

document.addEventListener('DOMContentLoaded', (event) => {
  const play = document.getElementById('play');
  const stop = document.getElementById('stop');

  play.addEventListener('click', () => {
    if (waveData.length > 0) {
      audioPlayer.play();
      time = performance.now()
      startInterval();
    } else {
      alert('Please upload an audio file first.');
    }
  });

  stop.addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    stopInterval();
  });
});