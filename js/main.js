const canvas = document.getElementById('Canvas');
const context = canvas.getContext('2d', { alpha: false });

var playBar = document.getElementById('playBar');

function resizeCanvas() {
    let screenWidth = window.innerWidth - 40;
    const aspectRatio = 16 / 9;
    canvas.width = screenWidth;
    canvas.height = screenWidth / aspectRatio;
    sizeRatio = canvas.width / 1280;
    
}

resizeCanvas();


const FPS = 60;
const log2DataSize = 8;
const dataSize = 2 ** log2DataSize;
const skipData = 40;
var waveData;
var duration;
var sizeRatio = canvas.width / 1280;
var backgroundImage = null;

const audioPlayer = document.getElementById('audioPlayer');
audioPlayer.style.display = 'none';

const playButton = document.getElementById('play');
const stopButton = document.getElementById('stop');

// Default settings
const defaultSettings = {
  thickness: 3,
  gain: 1.5,
  move: false,
  moveGain: 1,
  moveThreshold: 10,
  bassReduction: false,
  barColor: '#FFFFFF',
  spectrumShape: 'normal',
  xOffset: 0,
  yOffset: 0,
  scale: 1,
};

// Get references to control elements
const thicknessControl = document.getElementById("thickness");
const gainControl = document.getElementById("gain");
const moveControl = document.getElementById("move");
const moveGainControl = document.getElementById("moveGain");
const moveThresholdControl = document.getElementById("moveThreshold");
const bassReductionControl = document.getElementById("bassReduction");
const barColorControl = document.getElementById("barColor");
const spectrumShapeControl = document.getElementById("spectrumShape");
const xOffsetControl = document.getElementById("xOffset");
const yOffsetControl = document.getElementById("yOffset");
const scaleControl = document.getElementById("scale");
const resetSettingsButton = document.getElementById("resetSettings");

let move = false;
let moveValue = 0;
let bassReductionArray = Array(dataSize / 2).fill(1);

function applyBassReduction(enabled) {
  if (enabled) {
    for(let i = 0; i < dataSize / 2; i++) {
      bassReductionArray[i] = 0.75 * i / dataSize + 0.625;
    }
  } else {
    for(let i = 0; i < dataSize / 2; i++) {
      bassReductionArray[i] = 1;
    }
  }
}

function saveSettings() {
  const settings = {
    thickness: thicknessControl.value,
    gain: gainControl.value,
    move: moveControl.checked,
    moveGain: moveGainControl.value,
    moveThreshold: moveThresholdControl.value,
    bassReduction: bassReductionControl.checked,
    barColor: barColorControl.value,
    spectrumShape: spectrumShapeControl.value,
    xOffset: xOffsetControl.value,
    yOffset: yOffsetControl.value,
    scale: scaleControl.value,
  };
  localStorage.setItem('webAudioSpectrumSettings', JSON.stringify(settings));
}

function loadSettings() {
  const savedSettings = JSON.parse(localStorage.getItem('webAudioSpectrumSettings'));
  const settingsToApply = savedSettings || defaultSettings;

  thicknessControl.value = settingsToApply.thickness;
  gainControl.value = settingsToApply.gain;
  moveControl.checked = settingsToApply.move;
  moveGainControl.value = settingsToApply.moveGain;
  moveThresholdControl.value = settingsToApply.moveThreshold;
  bassReductionControl.checked = settingsToApply.bassReduction;
  barColorControl.value = settingsToApply.barColor;
  spectrumShapeControl.value = settingsToApply.spectrumShape;
  xOffsetControl.value = settingsToApply.xOffset;
  yOffsetControl.value = settingsToApply.yOffset;
  scaleControl.value = settingsToApply.scale;

  move = moveControl.checked;
  applyBassReduction(bassReductionControl.checked);
  drawSpctrum(); // Update visualization with loaded settings
}

function resetSettingsToDefault() {
  localStorage.removeItem('webAudioSpectrumSettings'); // Clear saved settings
  loadSettings(); // Load default settings
}

function updateButtonStates() {
  const isFileLoaded = waveData && waveData.length > 0;
  const isPlaying = !audioPlayer.paused;

  playButton.disabled = !isFileLoaded || isPlaying;
  stopButton.disabled = !isFileLoaded || !isPlaying;
}

function init() {
  const input = document.getElementById('fileInput');
  input.addEventListener('change', (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      audioPlayer.src = URL.createObjectURL(file);
      const audioContext = new AudioContext();

      audioContext.decodeAudioData(event.target.result, (buffer) => {
        const channelData = buffer.getChannelData(0);
        duration = buffer.duration;
        let audioData = [];
        for (let i = 0; i < channelData.length; i++) {
          audioData.push(channelData[i]);
        }
        waveData = audioData;
        getReverseBitArray();
        makeWList();
        updateButtonStates();

        const loadingBar = document.createElement('div');
        loadingBar.textContent = '音声ファイルを読み込みました';
        loadingBar.style.width = '90%';
        loadingBar.style.height = '50px';
        loadingBar.style.backgroundColor = '#229922';
        loadingBar.style.color = 'white';
        loadingBar.style.textAlign = 'center';
        loadingBar.style.lineHeight = '50px';
        loadingBar.style.position = 'fixed';
        loadingBar.style.top = '10px';
        loadingBar.style.left = '50%';
        loadingBar.style.transform = 'translateX(-50%)';
        loadingBar.style.borderRadius = '10px';
        loadingBar.style.zIndex = '1000';
        document.body.insertBefore(loadingBar, document.body.firstChild);

        setTimeout(() => {
          loadingBar.style.transition = 'opacity 1.5s ease';
          loadingBar.style.opacity = '0';
          setTimeout(() => {
            document.body.removeChild(loadingBar);
          }, 1500);
        }, 3000);
      }, (error) => {
          console.error('Error decoding audio data:', error);
          alert('Error decoding audio file. Please try a different file.');
          updateButtonStates();
      });
      
    }
    reader.readAsArrayBuffer(file);
  });
};

const squareSigma = 50;
FIR_list = [];
for (let i = -14; i < 15; i++) {
  FIR_list.push(Math.exp(-i * i / (2 * squareSigma)) / Math.sqrt(2 * Math.PI * squareSigma));
}

function lowpass(audioData, number) {
  let value = 0;
  for (let i = 0; i < 15; i++) {
    value += FIR_list[14 + i] * audioData[number + 2 * i];
    value += FIR_list[14 - i] * audioData[number - 2 * i];
  }
  value -= FIR_list[14] * audioData[number];
  return value;
}

function setData(audioData, time, audioLength) {
  let data = [];
  let now = Math.trunc(time * audioData.length / audioLength + 0.5);
  for (let i = 0; i < dataSize; i++) {
    data.push(windowFunction_List[i] * lowpass(audioData, Math.trunc(now + i * skipData)));
  }
  return data;
}

function windowFunction(x) {
  return 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x);
}

var windowFunction_List = [];
for (let i = 0; i < dataSize; i++) {
  windowFunction_List.push(windowFunction(i / (dataSize - 1)));
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

var reverseBitArray = [];
function getReverseBitArray() {
  for (let i = 0; i < dataSize; i++) {
    reverseBitArray.push(reverseBit(i, Math.trunc(Math.log(dataSize) / Math.log(2) + 0.5)));
  }
}

var wiRList = [];
var wiIList = [];
var wkRList = [];
var wkIList = [];
function makeWList() {
  let windowSize = 1;
  while (windowSize < dataSize) {
    windowSize *= 2;
    let _wiRList = [];
    let _wiIList = [];
    let _wkRList = [];
    let _wkIList = [];
    for (let i = 0; i < dataSize; i++) {
      if (i % windowSize < windowSize / 2) {
        let k = i + windowSize / 2;
        _wiRList.push(Math.cos(-2 * Math.PI * (i % windowSize) / windowSize));
        _wiIList.push(Math.sin(-2 * Math.PI * (i % windowSize) / windowSize));
        _wkRList.push(Math.cos(-2 * Math.PI * (k % windowSize) / windowSize));
        _wkIList.push(Math.sin(-2 * Math.PI * (k % windowSize) / windowSize));
      }
    }
    wiRList.push(_wiRList);
    wiIList.push(_wiIList);
    wkRList.push(_wkRList);
    wkIList.push(_wkIList);
  }
}

function FFT(data) {
  let Fi = Array(data.length).fill(0);
  let Fr = [];
  for (let i = 0; i < data.length; i++) {
    Fr.push(data[reverseBitArray[i]]);
  }
  let windowSize = 1;
  let j = 0;
  while (windowSize < data.length) {
    windowSize *= 2;
    let l = 0;
    for (let i = 0; i < data.length; i++) {
      if (i % windowSize < windowSize / 2) {
        let k = i + windowSize / 2;
        let wiR = wiRList[j][l];
        let wiI = wiIList[j][l];
        let wkR = wkRList[j][l];
        let wkI = wkIList[j][l];
        l += 1;
        [Fr[i], Fi[i], Fr[k], Fi[k]] = [Fr[i] + wiR * Fr[k] - wiI * Fi[k], Fi[i] + wiI * Fr[k] + wiR * Fi[k], Fr[i] + wkR * Fr[k] - wkI * Fi[k], Fi[i] + wkI * Fr[k] + wkR * Fi[k]];
      }
    }
    j += 1;
  }
  return [Fr, Fi];
}

function getSpectrum(data) {
  let F = FFT(data);
  let spectrum = [];
  for (let i = 0; i < data.length; i++) {
    spectrum.push(Math.sqrt(F[0][i] * F[0][i] + F[1][i] * F[1][i]) * 8);
  }
  return spectrum;
}

function drawSpctrum(data) {
  let spectrum = [];
  let getData;
  if(data == undefined) {
    spectrum = preSpectrum;
  } else {
    getData = getSpectrum(data);
    for (let i = 0; i < dataSize / 2; i++) {
      spectrum.push((getData[i] + preSpectrum[i]) / 2);
    }
    preSpectrum = getData;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImage) {
    context.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  } else {
    context.fillStyle = 'rgb(0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.save(); // 現在のキャンバスの状態を保存

  const currentScale = parseFloat(scaleControl.value);
  const currentXOffset = parseFloat(xOffsetControl.value);
  const currentYOffset = parseFloat(yOffsetControl.value);

  let baseCenterX, baseCenterY;
  const shape = spectrumShapeControl.value;

  if (shape === 'circle') {
    baseCenterX = canvas.width / 2;
    baseCenterY = canvas.height / 2;
  } else { // normal or symmetry
    baseCenterX = canvas.width / 2;
    baseCenterY = canvas.height * 2 / 3;
  }

  // 描画の中心を移動し、スケールを適用
  // 1. 描画の中心に原点を移動（オフセットも適用）
  context.translate(baseCenterX + currentXOffset, baseCenterY - currentYOffset);
  // 2. 拡大・縮小
  context.scale(currentScale, currentScale);

  context.beginPath();
  context.strokeStyle = barColorControl.value;
  context.lineWidth = thicknessControl.value * sizeRatio / currentScale; // スケールに合わせて線の太さも調整

  if (shape === 'circle') {
    const radius = Math.min(canvas.width, canvas.height) / 4;

    if (move) {
      let keepValue = 0;
      for (let i = 0; i < dataSize / 2; i++) {
        const angle = (i / (dataSize / 2)) * 2 * Math.PI;
        const barHeight = spectrum[i] * gainControl.value * bassReductionArray[i] * sizeRatio;
        const scaledRadius = radius * (1 + moveValue);

        // 基準点(0,0)からの相対座標で計算
        const x1 = scaledRadius * Math.cos(angle);
        const y1 = scaledRadius * Math.sin(angle);
        const x2 = (1 + scaledRadius + barHeight) * Math.cos(angle);
        const y2 = (1 + scaledRadius + barHeight) * Math.sin(angle);

        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        keepValue += spectrum[i];
      }
      moveValue = (1 - 1 / (moveThresholdControl.value)) * moveValue + (1 - (1 - 1 / (moveThresholdControl.value))) * keepValue * moveGainControl.value * 1e-4;
    } else {
      for (let i = 0; i < dataSize / 2; i++) {
        const angle = (i / (dataSize / 2)) * 2 * Math.PI;
        const barHeight = spectrum[i] * gainControl.value * bassReductionArray[i] * sizeRatio;

        // 基準点(0,0)からの相対座標で計算
        const x1 = radius * Math.cos(angle);
        const y1 = radius * Math.sin(angle);
        const x2 = (radius + barHeight) * Math.cos(angle);
        const y2 = (radius + barHeight) * Math.sin(angle);
        
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
      }
  }
  } else if (shape === 'symmetry') {
    if (move) {
      let keepValue = 0;
      for (let i = 0; i < dataSize / 2; i++) {
        // x座標の計算から `canvas.width / 2` を削除
        const x = (-canvas.width / 3 + (i / (dataSize / 2 - 1)) * canvas.width * (2 / 3)) * (1 + moveValue);
        // y座標の基準点を 0 に変更
        const y = 0;
        const height = (1 + spectrum[i] * gainControl.value * bassReductionArray[i]) * sizeRatio;
        
        context.moveTo(x, y);
        context.lineTo(x, y - height);
        context.moveTo(x, y);
        context.lineTo(x, y + height);
        keepValue += spectrum[i];
      }
      moveValue = (1 - 1 / (moveThresholdControl.value)) * moveValue + (1 - (1 - 1 / (moveThresholdControl.value))) * keepValue * moveGainControl.value * 1e-4;
    } else {
      for (let i = 0; i < dataSize / 2; i++) {
        // x座標の計算から `canvas.width / 2` を削除
        const x = -canvas.width / 3 + (i / (dataSize / 2 - 1)) * canvas.width * (2 / 3);
        // y座標の基準点を 0 に変更
        const y = 0;
        const height = (1 + spectrum[i] * gainControl.value * bassReductionArray[i]) * sizeRatio;

        context.moveTo(x, y);
        context.lineTo(x, y - height);
        context.moveTo(x, y);
        context.lineTo(x, y + height);
      }
    }
  } else { // normal
    if (move) {
      let keepValue = 0;
      for (let i = 0; i < dataSize / 2; i++) {
        const x = (-canvas.width / 3 + (i / (dataSize / 2 - 1)) * canvas.width * (2 / 3)) * (1 + moveValue);
        const y = 0;
        const height = (1 + spectrum[i] * gainControl.value * bassReductionArray[i]) * sizeRatio;

        context.moveTo(x, y);
        context.lineTo(x, y - height);
        keepValue += spectrum[i];
      }
      moveValue = (1 - 1 / (moveThresholdControl.value)) * moveValue + (1 - (1 - 1 / (moveThresholdControl.value))) * keepValue * moveGainControl.value * 1e-4;
    } else {
      for (let i = 0; i < dataSize / 2; i++) {
        const x = -canvas.width / 3 + (i / (dataSize / 2 - 1)) * canvas.width * (2 / 3);
        const y = 0;
        const height = (1 + spectrum[i] * gainControl.value * bassReductionArray[i]) * sizeRatio;

        context.moveTo(x, y);
        context.lineTo(x, y - height);
      }
    }
  }
  context.stroke();

  context.restore(); // キャンバスの状態を復元
}

function drawWave(data, time, audioLength) {
  let now = Math.trunc(time * data.length / audioLength + 0.5);
  context.strokeStyle = "White";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(canvas.width / 2 - canvas.width / 4, canvas.height / 2 - 200 - data[Math.trunc(now)] * 100);
  for (let i = 0; i < dataSize; i++) {
    context.lineTo(canvas.width / 2 + (i / (dataSize - 1)) * canvas.width * (1 / 2) - canvas.width / 4, canvas.height / 2 - 200 - data[Math.trunc(now + i * skipData / 10)] * 100);
  }
  context.stroke();
}

function updatePlayBar(time, duration) {
  const playBar = document.getElementById('playBar');
  const progress = (time / duration) * 100;
  playBar.style.background = `linear-gradient(to right, ${"#FF0000"} ${progress * (1 - 20/canvas.width)+1000/canvas.width}%, ${"#CCCCCC"} ${progress * (1 - 20/canvas.width)+1000/canvas.width}%)`;
  playBar.value = progress;
}

var animationRunning = false;
var num = 0;
var preSpectrum = Array(dataSize).fill(0);

function animate() {
  if (!animationRunning) return; // アニメーションが停止している場合は終了

  if(num < 1) {
    drawSpctrum(setData(waveData, audioPlayer.currentTime + 1 / FPS, duration));
    updatePlayBar(audioPlayer.currentTime, duration);
    num += 1;
  } else {
    drawSpctrum();
    updatePlayBar(audioPlayer.currentTime, duration);
    num = 0;
  }
  requestAnimationFrame(animate);
}

document.getElementById('playBar').addEventListener('input', function() {
  const currentTime = this.value * duration / 100;
  audioPlayer.currentTime = currentTime;
});

document.getElementById('playBar').addEventListener('change', function() {
  const currentTime = this.value * duration / 100;
  audioPlayer.currentTime = currentTime;
});

document.getElementById('playBar').addEventListener('mouseup', function() {
  const currentTime = this.value * duration / 100;
  audioPlayer.currentTime = currentTime;
});

function startAnimation() {
  animationRunning = true;
  animate();
}

function stopAnimation() {
  animationRunning = false;
}

document.addEventListener('DOMContentLoaded', (event) => {
  init();
  loadSettings(); // Load settings on page load
  updateButtonStates();

  // Event listeners for saving settings
  thicknessControl.addEventListener('input', saveSettings);
  gainControl.addEventListener('input', saveSettings);
  moveControl.addEventListener('change', () => { move = moveControl.checked; saveSettings(); });
  moveGainControl.addEventListener('input', saveSettings);
  moveThresholdControl.addEventListener('input', saveSettings);
  bassReductionControl.addEventListener('change', () => { applyBassReduction(bassReductionControl.checked); saveSettings(); });
  barColorControl.addEventListener('input', saveSettings);
  spectrumShapeControl.addEventListener('change', () => { drawSpctrum(); saveSettings(); });
  xOffsetControl.addEventListener('input', saveSettings);
  yOffsetControl.addEventListener('input', saveSettings);
  scaleControl.addEventListener('input', saveSettings);
  resetSettingsButton.addEventListener('click', resetSettingsToDefault);

  const bgImageInput = document.getElementById('bgImageInput');
  bgImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          backgroundImage = img;
          drawSpctrum(); // 画像が読み込まれたら再描画
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  playButton.addEventListener('click', () => {  
      audioPlayer.play();
      startAnimation();
      moveValue = 0;
  });

  stopButton.addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    stopAnimation();
  });

  audioPlayer.addEventListener('play', updateButtonStates);
  audioPlayer.addEventListener('pause', updateButtonStates);
});
