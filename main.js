// ตัวแปรเก็บ log ประจำ Session ตามบรีฟ ทำลายตัวเองทันทีเมื่อ Reload หน้าเว็บหรือปิดแท็บ
let htmlLog = [];

function addToSessionLog(type, message, detail = "") {
  const timestamp = new Date().toISOString().split("T")[1].substring(0, 8);
  const logEntry = `[${timestamp}] [${type}] ${message} ${detail ? "\nDetail: " + detail : ""}`;
  htmlLog.push(logEntry);
  console.log(logEntry);
}

// บันทึก Log การเริ่มต้นทำงานไฟล์
addToSessionLog("SYSTEM", "Application initialized successfully.");

window.addEventListener("error", function (e) {
  const stackTrace = e.error ? e.error.stack : "No call stack available.";
  addToSessionLog("CRITICAL_ERROR", e.message, stackTrace);
  displayErrorPopup("Uncaught Runtime Exception", e.message, stackTrace);
});

function displayErrorPopup(type, message, stack) {
  document.getElementById("popup-err-type").textContent = type;
  document.getElementById("popup-err-message").textContent = message;
  document.getElementById("popup-err-stack").textContent =
    stack || "No call stack trace records.";

  // รีเซ็ตสถานะปุ่มคลี่ log ให้ซ่อนไว้ก่อนทุกครั้งที่แสดงผลใหม่เพื่อกันตกใจ
  const logPanel = document.getElementById("popup-err-stack");
  const toggleBtn = document.getElementById("btn-toggle-log");
  logPanel.style.display = "none";
  toggleBtn.textContent = "ดู log ตัวเต็ม (Show Full Log) ▼";

  document.getElementById("notification-popup-overlay").style.display = "flex";
}

function toggleErrorLog() {
  const logPanel = document.getElementById("popup-err-stack");
  const toggleBtn = document.getElementById("btn-toggle-log");
  if (logPanel.style.display === "none" || logPanel.style.display === "") {
    logPanel.style.display = "block";
    toggleBtn.textContent = "ซ่อน log ตัวเต็ม (Hide Full Log) ▲";
  } else {
    logPanel.style.display = "none";
    toggleBtn.textContent = "ดู log ตัวเต็ม (Show Full Log) ▼";
  }
}

function closeErrorPopup() {
  document.getElementById("notification-popup-overlay").style.display = "none";
}

const fileInput = document.getElementById("file");
const paletteFileInput = document.getElementById("palette-file-reader");
const runButton = document.getElementById("run");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");
const statusDiv = document.getElementById("status");
const textarea = document.getElementById("output");
const previewContainer = document.querySelector(".image-preview-container");
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const inputWidth = document.getElementById("width");
const inputHeight = document.getElementById("height");
const inputFactor = document.getElementById("factor");
const inputRatio = document.getElementById("ratio");
const paletteArcadeColors = [
  "#ffffff",
  "#ff2121",
  "#ff93c4",
  "#ff8135",
  "#fff609",
  "#249ca3",
  "#78dc52",
  "#003fad",
  "#87f2ff",
  "#8e2ec4",
  "#a4839f",
  "#5c406c",
  "#e5cdc4",
  "#91463d",
  "#000000",
];

let originalImageSize = { width: 0, height: 0 };
let originalMimeType = "image/png";
let canvasName = "pic2mkca-null.png",
  convertedName = "pic2mkca";
let rgbPalette = [];
let dateString = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replaceAll(".", "");

document.querySelectorAll(".color-pair").forEach((pair, idx) => {
  const picker = pair.querySelector('input[type="color"]');
  const txt = pair.querySelector(".colortext");
  picker.addEventListener("input", function () {
    txt.value = this.value;
  });
  txt.addEventListener("change", function () {
    let val = this.value.trim();
    if (!val.startsWith("#")) val = "#" + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      picker.value = val;
      this.value = val;
      addToSessionLog("PALETTE", `Color slot ${idx + 1} updated to ${val}`);
    }
  });
});

paletteFileInput.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    const lines = evt.target.result.split(/\r?\n/);
    let colorsFound = [];
    lines.forEach((line) => {
      let clean = line.trim().replace(/;.*$/, "").trim();
      if (!clean) return;
      let match = clean.match(/#?([0-9A-Fa-f]{6})/);
      if (match) {
        colorsFound.push("#" + match[1].toLowerCase());
      }
    });
    if (colorsFound.length > 0) {
      const pairs = document.querySelectorAll(".color-pair");
      for (let i = 0; i < pairs.length && i < colorsFound.length; i++) {
        const picker = pairs[i].querySelector('input[type="color"]');
        const txt = pairs[i].querySelector(".colortext");
        picker.value = colorsFound[i];
        txt.value = colorsFound[i];
      }
      statusDiv.textContent = `System: Loaded ${Math.min(pairs.length, colorsFound.length)} colors from palette file.`;
      addToSessionLog(
        "PALETTE",
        `Imported external palette from ${file.name}. Total found: ${colorsFound.length}`,
      );
    } else {
      alert("No valid hex colors found in the selected file.");
    }
  };
  reader.readAsText(file);
});

function parseCurrentPalette() {
  rgbPalette = [];
  document.querySelectorAll(".color-pair").forEach((pair) => {
    const hex = pair.querySelector('input[type="color"]').value;
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    rgbPalette.push({ r, g, b });
  });
}

function findNearestColor(r, g, b) {
  let minDistance = Infinity;
  let nearestIndex = 1;
  for (let i = 0; i < rgbPalette.length; i++) {
    const distance =
      Math.pow(r - rgbPalette[i].r, 2) +
      Math.pow(g - rgbPalette[i].g, 2) +
      Math.pow(b - rgbPalette[i].b, 2);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i + 1;
    }
  }
  return nearestIndex;
}

fileInput.addEventListener("change", function () {
  textarea.value = "";
  const file = fileInput.files[0];
  if (!file) return;

  dateString = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "");

  originalMimeType = file.type || "image/png";
  canvasName = `${file.name.substring(0, file.name.lastIndexOf("."))}_${convertedName}_${dateString}${file.name.substring(file.name.lastIndexOf("."))}`;
  if (file.name.toLowerCase().endsWith(".gif")) {
    canvasName = `${file.name.substring(0, file.name.lastIndexOf("."))}_${convertedName}-${dateString}.png`;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = () => {
      try {
        if (previewContainer) previewContainer.style.display = "flex";

        originalImageSize.width = img.naturalWidth;
        originalImageSize.height = img.naturalHeight;

        document.getElementById("original-res").textContent =
          `Size: ${img.naturalWidth} x ${img.naturalHeight} px`;
        document.getElementById("canvas-res").textContent = `Size: -- x -- px`;

        const zone = document.getElementById("original-preview-zone");
        zone.innerHTML = "";
        zone.appendChild(img);

        document
          .querySelectorAll("input[disabled]")
          .forEach((el) => el.removeAttribute("disabled"));
        runButton.removeAttribute("disabled");
        downloadButton.removeAttribute("disabled");

        updateCalculatedDimensions();
        statusDiv.textContent = `Ready: ${file.name} Loaded Successfully.`;
        addToSessionLog(
          "IMAGE",
          `Loaded target resource file: ${file.name} (${img.naturalWidth}x${img.naturalHeight})`,
        );
      } catch (innerErr) {
        displayErrorPopup(
          "Image Allocation Core Exception",
          innerErr.message,
          innerErr.stack,
        );
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

function updateCalculatedDimensions() {
  const img = document.querySelector("#original-preview-zone img");
  if (!img) return;

  if (document.getElementById("full-width").checked) {
    inputWidth.value = 160;
    inputHeight.value = Math.round(
      originalImageSize.height * (160 / originalImageSize.width),
    );
  } else if (document.getElementById("full-height").checked) {
    inputHeight.value = 120;
    inputWidth.value = Math.round(
      originalImageSize.width * (120 / originalImageSize.height),
    );
  } else if (document.getElementById("scale").checked) {
    const f = parseFloat(inputFactor.value) || 0.1;
    inputWidth.value = Math.round(originalImageSize.width * f);
    inputHeight.value = Math.round(originalImageSize.height * f);
  }
}

document.querySelectorAll('input[name="resize"], #factor').forEach((el) => {
  el.addEventListener("change", updateCalculatedDimensions);
  el.addEventListener("input", updateCalculatedDimensions);
});

inputWidth.addEventListener("input", function () {
  if (inputRatio.checked && originalImageSize.width > 0) {
    inputHeight.value = Math.round(
      (originalImageSize.height * (parseInt(this.value) || 1)) /
        originalImageSize.width,
    );
  }
});
inputHeight.addEventListener("input", function () {
  if (inputRatio.checked && originalImageSize.height > 0) {
    inputWidth.value = Math.round(
      (originalImageSize.width * (parseInt(this.value) || 1)) /
        originalImageSize.height,
    );
  }
});

// --- ฟังก์ชันประมวลผลหลักที่ได้รับการซ่อมแซมและรองรับความโปร่งแสงสมบูรณ์ทุกโหมด ---
runButton.addEventListener("click", function (e) {
  e.preventDefault();
  try {
    const img = document.querySelector("#original-preview-zone img");
    if (!img) return;

    parseCurrentPalette();

    const w = parseInt(inputWidth.value) || 16;
    const h = parseInt(inputHeight.value) || 16;
    canvas.width = w;
    canvas.height = h;

    document.getElementById("canvas-res").textContent = `Size: ${w} x ${h} px`;
    const mode = document
      .querySelector('input[name="mode"]:checked')
      .id.replace("mode-", "");
    statusDiv.textContent = `Processing matrix pipeline [${mode}]...`;
    addToSessionLog(
      "PIPELINE",
      `Start processing conversion. Target dimensions: ${w}x${h}. Mode: ${mode}`,
    );

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // จองพื้นที่ Array 2 มิติเพื่อป้องกันข้อผิดพลาด Undefined ตลอดสายการแปลงข้อมูล
    let outputHexArray = [];
    for (let y = 0; y < h; y++) {
      outputHexArray[y] = new Array(w);
    }

    if (mode === "solid") {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          if (data[idx + 3] < 128) {
            outputHexArray[y][x] = "0"; // โปร่งแสง
          } else {
            const nIdx = findNearestColor(
              data[idx],
              data[idx + 1],
              data[idx + 2],
            );
            outputHexArray[y][x] = nIdx.toString(16);
          }
        }
      }
    } else if (mode === "error") {
      // โหมด Error Diffusion (Floyd-Steinberg): ซ่อมแซมระบบข้ามพิกเซลและจัดการเศษสีเหลือทิ้ง
      let errors = new Float32Array(w * h * 3);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const errIdx = (y * w + x) * 3;

          if (data[idx + 3] < 128) {
            outputHexArray[y][x] = "0";
            continue; // ข้ามไปโดยพิกเซลโปร่งแสงจะไม่กระจายสีเพี้ยนใส่พิกเซลข้างเคียง
          }

          let r = data[idx] + errors[errIdx];
          let g = data[idx + 1] + errors[errIdx + 1];
          let b = data[idx + 2] + errors[errIdx + 2];

          r = Math.max(0, Math.min(255, r));
          g = Math.max(0, Math.min(255, g));
          b = Math.max(0, Math.min(255, b));

          const nIdx = findNearestColor(r, g, b);
          outputHexArray[y][x] = nIdx.toString(16);

          const actualColor = rgbPalette[nIdx - 1];
          const er = r - actualColor.r;
          const eg = g - actualColor.g;
          const eb = b - actualColor.b;

          // ฟังก์ชันย่อยกระจาย Error ไปยังพิกเซลข้างเคียงเฉพาะจุดที่เป็นพิกเซลทึบแสงเท่านั้น
          const distribute = (nx, ny, factor) => {
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nIdxNext = (ny * w + nx) * 4;
              if (data[nIdxNext + 3] >= 128) {
                const eIdx = (ny * w + nx) * 3;
                errors[eIdx] += er * factor;
                errors[eIdx + 1] += eg * factor;
                errors[eIdx + 2] += eb * factor;
              }
            }
          };
          distribute(x + 1, y, 7 / 16);
          distribute(x - 1, y + 1, 3 / 16);
          distribute(x, y + 1, 5 / 16);
          distribute(x + 1, y + 1, 1 / 16);
        }
      }
    } else if (mode === "bayer") {
      // โหมด Ordered Bayer Matrix: ซ่อมแซมโครงพิกเซลโปร่งแสงสอดคล้องกับมิติภาพอย่างแม่นยำ
      const bayer = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
      ];
      const spread = 48;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          if (data[idx + 3] < 128) {
            outputHexArray[y][x] = "0";
            continue;
          }
          const bayerValue = bayer[y % 4][x % 4];
          const factor = bayerValue / 16 - 0.5;

          let r = data[idx] + factor * spread;
          let g = data[idx + 1] + factor * spread;
          let b = data[idx + 2] + factor * spread;

          const nIdx = findNearestColor(r, g, b);
          outputHexArray[y][x] = nIdx.toString(16);
        }
      }
    }

    // แสดงผลลัพธ์กลับลง Canvas พรีวิว
    ctx.clearRect(0, 0, w, h);
    const outImgData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const char = outputHexArray[y][x];
        const outIdx = (y * w + x) * 4;
        if (!char || char === "0") {
          outImgData.data[outIdx] = 0;
          outImgData.data[outIdx + 1] = 0;
          outImgData.data[outIdx + 2] = 0;
          outImgData.data[outIdx + 3] = 0; // ตั้งค่าโปร่งแสงสมบูรณ์
        } else {
          const palColor = rgbPalette[parseInt(char, 16) - 1];
          outImgData.data[outIdx] = palColor.r;
          outImgData.data[outIdx + 1] = palColor.g;
          outImgData.data[outIdx + 2] = palColor.b;
          outImgData.data[outIdx + 3] = 255;
        }
      }
    }
    ctx.putImageData(outImgData, 0, 0);

    // แปลงอาเรย์รหัสฐานสิบหกออกมาเป็น Code String ประจำอาร์เคดสไปรต์
    let finalCodeStr = `img\\\`\\n`;
    for (let y = 0; y < h; y++) {
      finalCodeStr += "    " + outputHexArray[y].join("") + "\n";
    }
    finalCodeStr += `\\\``;

    textarea.value = finalCodeStr;
    copyButton.removeAttribute("disabled");
    statusDiv.textContent = `Success: Convert completed in [${mode.toUpperCase()}] mode.`;
    addToSessionLog(
      "PIPELINE",
      `Render successful for [${mode.toUpperCase()}] method.`,
    );
  } catch (pipelineErr) {
    addToSessionLog("MATRIX_FAULT", pipelineErr.message, pipelineErr.stack);
    displayErrorPopup(
      "Matrix Pipeline Conversion Fault",
      pipelineErr.message,
      pipelineErr.stack,
    );
  }
});

copyButton.addEventListener("click", function (e) {
  e.preventDefault();
  textarea.select();
  document.execCommand("copy");
  copyButton.innerText = "Code copied to clipboard!";
  addToSessionLog(
    "IO",
    "Output vector text data copied into clipboard register.",
  );
  setTimeout(() => {
    copyButton.innerText = "Copy code";
  }, 2000);
});

downloadButton.addEventListener("click", function (e) {
  e.preventDefault();
  try {
    const imgInfo = document.querySelector("#original-preview-zone img");
    if (!imgInfo) return alert("No active image asset to download.");

    let exportMimeType = originalMimeType;
    if (originalMimeType === "image/gif") {
      exportMimeType = "image/png";
    }

    const dataUrl = canvas.toDataURL(exportMimeType);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = canvasName;
    link.click();
    link.remove();
    addToSessionLog(
      "IO",
      `Triggered canvas attachment file download: ${canvasName}`,
    );
  } catch (dnErr) {
    addToSessionLog("DOWNLOAD_FAULT", dnErr.message, dnErr.stack);
    displayErrorPopup("IO Canvas Download Error", dnErr.message, dnErr.stack);
  }
});
