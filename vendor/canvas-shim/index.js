"use strict";

const {
  createCanvas,
  Canvas: NapiCanvas,
  Image,
  loadImage,
  DOMMatrix,
  DOMPoint,
  DOMRect,
  ImageData,
  Path2D,
  GlobalFonts,
} = require("@napi-rs/canvas");

// Vega expects `new require('canvas').Canvas(width, height[, type])`.
function Canvas(width, height, _type) {
  return createCanvas(width, height);
}

Canvas.prototype = NapiCanvas?.prototype;

module.exports = {
  Canvas,
  createCanvas,
  Image,
  loadImage,
  DOMMatrix,
  DOMPoint,
  DOMRect,
  ImageData,
  Path2D,
  GlobalFonts,
};
