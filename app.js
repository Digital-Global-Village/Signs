const imageInput = document.querySelector("#imageInput");
const dropZone = document.querySelector("#dropZone");
const canvasWrap = document.querySelector("#canvasWrap");
const emptyState = document.querySelector(".empty-state");
const previewCanvas = document.querySelector("#previewCanvas");
const ctx = previewCanvas.getContext("2d", { willReadFrequently: true });

const threshold = document.querySelector("#threshold");
const softness = document.querySelector("#softness");
const darkness = document.querySelector("#darkness");
const thresholdValue = document.querySelector("#thresholdValue");
const softnessValue = document.querySelector("#softnessValue");
const darknessValue = document.querySelector("#darknessValue");
const blackInk = document.querySelector("#blackInk");
const autoCropButton = document.querySelector("#autoCropButton");
const manualCropButton = document.querySelector("#manualCropButton");
const restoreCropButton = document.querySelector("#restoreCropButton");
const cropActions = document.querySelector("#cropActions");
const applyCropButton = document.querySelector("#applyCropButton");
const cropSelection = document.querySelector("#cropSelection");
const resetButton = document.querySelector("#resetButton");
const downloadButton = document.querySelector("#downloadButton");
const shareButton = document.querySelector("#shareButton");
const statusText = document.querySelector("#status");
const swatches = document.querySelectorAll(".swatch");

let originalImageData = null;
let originalFileName = "signature";
let cropRect = null;
let autoCropRegion = null;
let selectingCrop = false;
let cropStart = null;
let draftCrop = null;
let cropPointer = null;
if (navigator.share && navigator.canShare) shareButton.classList.remove("hidden");

canvasWrap.classList.add("checker");

function setStatus(message) {
  statusText.textContent = message;
}

function updateOutputValues() {
  thresholdValue.value = threshold.value;
  softnessValue.value = softness.value;
  darknessValue.value = darkness.value;
}

function enableControls(enabled) {
  autoCropButton.disabled = !enabled;
  manualCropButton.disabled = !enabled;
  restoreCropButton.disabled = !enabled || !cropRect;
  resetButton.disabled = !enabled;
  downloadButton.disabled = !enabled;
  shareButton.disabled = !enabled;
}

function normalizeFileName(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "signature";
}

function fitDimensions(width, height, maxSide = 2200) {
  if (Math.max(width, height) <= maxSide) {
    return { width, height };
  }
  const scale = maxSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImageFromFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Please choose an image file.");
    return;
  }

  originalFileName = normalizeFileName(file.name);
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    const image = new Image();
    image.addEventListener("load", () => {
      const fitted = fitDimensions(image.naturalWidth, image.naturalHeight);
      const sourceCanvas = document.createElement("canvas");
      const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });

      sourceCanvas.width = fitted.width;
      sourceCanvas.height = fitted.height;
      sourceCtx.drawImage(image, 0, 0, fitted.width, fitted.height);

      originalImageData = sourceCtx.getImageData(0, 0, fitted.width, fitted.height);
      cropRect = null;
      autoCropRegion = null;
      finishCropSelection();
      emptyState.classList.add("hidden");
      canvasWrap.classList.remove("hidden");
      enableControls(true);
      renderSignature();
      setStatus(`Loaded ${file.name}. Adjust cleanup until only the ink remains, then download the PNG.`);
    });

    image.addEventListener("error", () => {
      setStatus("That image could not be opened. Try another photo.");
    });

    image.src = reader.result;
  });

  reader.readAsDataURL(file);
}

function getProcessedImageData() {
  if (!originalImageData) {
    return null;
  }

  const source = originalImageData.data;
  const output = new ImageData(originalImageData.width, originalImageData.height);
  const target = output.data;
  const thresholdAmount = Number(threshold.value);
  const softnessAmount = Math.max(1, Number(softness.value));
  const inkBoost = Number(darkness.value);
  const makeBlack = blackInk.checked;

  for (let index = 0; index < source.length; index += 4) {
    const red = source[index];
    const green = source[index + 1];
    const blue = source[index + 2];
    const alpha = source[index + 3];
    const brightness = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    const darknessFromWhite = 255 - brightness;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const inkScore = darknessFromWhite + chroma * 0.25;
    const opacity = Math.max(0, Math.min(255, ((inkScore - thresholdAmount) / softnessAmount) * 255));

    if (makeBlack) {
      target[index] = 0;
      target[index + 1] = 0;
      target[index + 2] = 0;
    } else {
      target[index] = Math.max(0, red - inkBoost);
      target[index + 1] = Math.max(0, green - inkBoost);
      target[index + 2] = Math.max(0, blue - inkBoost);
    }

    target[index + 3] = Math.round((opacity * alpha) / 255);
  }

  return output;
}

function cropImageData(imageData, rect) {
  const safeRect = rect || { x: 0, y: 0, width: imageData.width, height: imageData.height };
  const cropped = new ImageData(safeRect.width, safeRect.height);

  for (let y = 0; y < safeRect.height; y += 1) {
    for (let x = 0; x < safeRect.width; x += 1) {
      const sourceIndex = ((safeRect.y + y) * imageData.width + safeRect.x + x) * 4;
      const targetIndex = (y * safeRect.width + x) * 4;
      cropped.data[targetIndex] = imageData.data[sourceIndex];
      cropped.data[targetIndex + 1] = imageData.data[sourceIndex + 1];
      cropped.data[targetIndex + 2] = imageData.data[sourceIndex + 2];
      cropped.data[targetIndex + 3] = imageData.data[sourceIndex + 3];
    }
  }

  return cropped;
}

function renderSignature() {
  const processed = getProcessedImageData();
  if (!processed) {
    return;
  }

  if (autoCropRegion) {
    const bounds = findInkBounds(cropImageData(processed, autoCropRegion));
    cropRect = bounds ? {
      ...bounds, x: bounds.x + autoCropRegion.x, y: bounds.y + autoCropRegion.y,
    } : autoCropRegion;
  }
  const visibleImage = cropImageData(processed, cropRect);
  previewCanvas.width = visibleImage.width;
  previewCanvas.height = visibleImage.height;
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.putImageData(visibleImage, 0, 0);
  restoreCropButton.disabled = !cropRect || selectingCrop;
  drawCropSelection();
}

function findInkBounds(imageData) {
  let minX = imageData.width;
  let minY = imageData.height;
  let maxX = -1;
  let maxY = -1;
  const data = imageData.data;

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const alpha = data[(y * imageData.width + x) * 4 + 3];
      if (alpha > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const padding = Math.max(16, Math.round(Math.max(imageData.width, imageData.height) * 0.025));
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(imageData.width, maxX + padding + 1) - Math.max(0, minX - padding),
    height: Math.min(imageData.height, maxY + padding + 1) - Math.max(0, minY - padding),
  };
}

function autoCrop() {
  const processed = getProcessedImageData();
  if (!processed) {
    return;
  }

  finishCropSelection();
  // Keep the selected region as the search area so later cleanup can expand the bounds.
  const region = autoCropRegion || cropRect || {
    x: 0, y: 0, width: processed.width, height: processed.height,
  };
  const bounds = findInkBounds(cropImageData(processed, region));
  if (!bounds) {
    setStatus("I could not find enough ink to crop. Lower background removal and try again.");
    return;
  }

  autoCropRegion = region;
  renderSignature();
  setStatus("Cropped to the visible ink. Download when it looks right.");
}

function resetImage() {
  finishCropSelection();
  cropRect = null;
  autoCropRegion = null;
  threshold.value = 78;
  softness.value = 22;
  darkness.value = 32;
  blackInk.checked = false;
  updateOutputValues();
  renderSignature();
  setStatus("Reset cleanup settings and crop.");
}

function finishCropSelection() {
  if (cropPointer !== null && previewCanvas.hasPointerCapture(cropPointer)) {
    previewCanvas.releasePointerCapture(cropPointer);
  }
  selectingCrop = false;
  draftCrop = null;
  cropStart = null;
  cropPointer = null;
  previewCanvas.classList.remove("selecting-crop");
  cropActions.classList.add("hidden");
  cropSelection.classList.add("hidden");
  manualCropButton.setAttribute("aria-pressed", "false");
  enableControls(Boolean(originalImageData));
}

function canvasPoint(event) {
  const rect = previewCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(previewCanvas.width, (event.clientX - rect.left) * previewCanvas.width / rect.width)),
    y: Math.max(0, Math.min(previewCanvas.height, (event.clientY - rect.top) * previewCanvas.height / rect.height)),
  };
}

function selectionRect(start, end, width, height) {
  const x = Math.max(0, Math.floor(Math.min(start.x, end.x)));
  const y = Math.max(0, Math.floor(Math.min(start.y, end.y)));
  return {
    x, y,
    width: Math.min(width, Math.ceil(Math.max(start.x, end.x))) - x,
    height: Math.min(height, Math.ceil(Math.max(start.y, end.y))) - y,
  };
}

function drawCropSelection() {
  cropSelection.classList.add("hidden");
  if (!selectingCrop || !draftCrop) return;
  cropSelection.style.left = `${draftCrop.x / previewCanvas.width * 100}%`;
  cropSelection.style.top = `${draftCrop.y / previewCanvas.height * 100}%`;
  cropSelection.style.width = `${draftCrop.width / previewCanvas.width * 100}%`;
  cropSelection.style.height = `${draftCrop.height / previewCanvas.height * 100}%`;
  cropSelection.classList.remove("hidden");
}

manualCropButton.addEventListener("click", () => {
  if (!originalImageData) return;
  finishCropSelection();
  selectingCrop = true;
  previewCanvas.classList.add("selecting-crop");
  cropActions.classList.remove("hidden");
  manualCropButton.setAttribute("aria-pressed", "true");
  applyCropButton.disabled = true;
  autoCropButton.disabled = true;
  restoreCropButton.disabled = true;
  downloadButton.disabled = true;
  shareButton.disabled = true;
  setStatus("Drag across the preview to select the signature, then Apply crop.");
});

previewCanvas.addEventListener("pointerdown", (event) => {
  if (!selectingCrop || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  cropPointer = event.pointerId;
  cropStart = canvasPoint(event);
  draftCrop = null;
  applyCropButton.disabled = true;
  previewCanvas.setPointerCapture(event.pointerId);
  drawCropSelection();
});

function updateCropDrag(event) {
  if (!selectingCrop || !cropStart || event.pointerId !== cropPointer) return;
  draftCrop = selectionRect(cropStart, canvasPoint(event), previewCanvas.width, previewCanvas.height);
  applyCropButton.disabled = draftCrop.width < 2 || draftCrop.height < 2;
  drawCropSelection();
}

previewCanvas.addEventListener("pointermove", updateCropDrag);
previewCanvas.addEventListener("pointerup", (event) => {
  updateCropDrag(event);
  if (event.pointerId !== cropPointer) return;
  cropStart = null;
  previewCanvas.releasePointerCapture(event.pointerId);
  cropPointer = null;
});
previewCanvas.addEventListener("pointercancel", () => {
  finishCropSelection();
  setStatus("Crop cancelled.");
});

applyCropButton.addEventListener("click", () => {
  if (!draftCrop || draftCrop.width < 2 || draftCrop.height < 2) return;
  cropRect = {
    ...draftCrop, x: draftCrop.x + (cropRect?.x || 0), y: draftCrop.y + (cropRect?.y || 0),
  };
  autoCropRegion = null;
  finishCropSelection();
  renderSignature();
  setStatus(`Cropped to ${cropRect.width} x ${cropRect.height} pixels.`);
});
document.querySelector("#cancelCropButton").addEventListener("click", () => {
  finishCropSelection();
  setStatus("Crop cancelled.");
});
restoreCropButton.addEventListener("click", () => {
  finishCropSelection();
  cropRect = null;
  autoCropRegion = null;
  renderSignature();
  setStatus("Full image restored. Cleanup settings kept.");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selectingCrop) {
    finishCropSelection();
    setStatus("Crop cancelled.");
  }
});

function downloadPng() {
  if (!originalImageData) {
    return;
  }

  const link = document.createElement("a");
  link.download = `${originalFileName}-transparent-signature.png`;
  link.href = previewCanvas.toDataURL("image/png");
  link.click();
  setStatus("Downloaded a transparent PNG. You can insert it into Word or place it onto a PDF.");
}

imageInput.addEventListener("change", (event) => {
  loadImageFromFile(event.target.files[0]);
  event.target.value = "";
});

document.querySelector("#cameraInput").addEventListener("change", (event) => {
  loadImageFromFile(event.target.files[0]);
  event.target.value = "";
});

shareButton.addEventListener("click", async () => {
  if (!originalImageData) return;
  const encoded = previewCanvas.toDataURL("image/png").split(",")[1];
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const file = new File([bytes], `${originalFileName}-transparent-signature.png`, { type: "image/png" });
  if (!navigator.canShare({ files: [file] })) {
    setStatus("File sharing is unavailable here. Use Download transparent PNG.");
    return;
  }
  try {
    await navigator.share({ files: [file] });
    setStatus("Signature shared.");
  } catch (error) {
    if (error.name !== "AbortError") setStatus("Sharing failed. Use Download transparent PNG.");
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", (event) => {
  loadImageFromFile(event.dataTransfer.files[0]);
});

[threshold, softness, darkness, blackInk].forEach((control) => {
  control.addEventListener("input", () => {
    if (selectingCrop) finishCropSelection();
    updateOutputValues();
    renderSignature();
  });
});

autoCropButton.addEventListener("click", autoCrop);
resetButton.addEventListener("click", resetImage);
downloadButton.addEventListener("click", downloadPng);

swatches.forEach((swatch) => {
  swatch.addEventListener("click", () => {
    swatches.forEach((item) => item.classList.remove("active"));
    swatch.classList.add("active");
    canvasWrap.classList.remove("checker", "cream", "dark");
    if (swatch.dataset.bg !== "white") {
      canvasWrap.classList.add(swatch.dataset.bg);
    }
  });
});

updateOutputValues();
enableControls(false);
