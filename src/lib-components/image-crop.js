import clsx from "clsx";
import "./image-crop.less";
let passiveSupported = false;

try {
  window.addEventListener(
    "test",
    null,
    Object.defineProperty({}, "passive", {
      get: () => {
        passiveSupported = true;
        return true;
      }
    })
  );
} catch (err) { } // eslint-disable-line no-empty

function getClientPos(e) {
  let pageX;
  let pageY;

  if (e.touches) {
    [{ pageX, pageY }] = e.touches;
  } else {
    ({ pageX, pageY } = e);
  }

  return {
    x: pageX,
    y: pageY
  };
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function isCropValid(crop) {
  return (
    crop &&
    crop.width &&
    crop.height &&
    !isNaN(crop.width) &&
    !isNaN(crop.height)
  );
}

function inverseOrd(ord) {
  if (ord === "n") return "s";
  if (ord === "ne") return "sw";
  if (ord === "e") return "w";
  if (ord === "se") return "nw";
  if (ord === "s") return "n";
  if (ord === "sw") return "ne";
  if (ord === "w") return "e";
  if (ord === "nw") return "se";
  return ord;
}

function makeAspectCrop(crop, imageWidth, imageHeight) {
  if (isNaN(crop.aspect)) {
    console.warn(
      "`crop.aspect` should be a number in order to make an aspect crop",
      crop
    );
    return crop;
  }

  const completeCrop = {
    unit: "px",
    x: 0,
    y: 0,
    ...crop
  };

  if (crop.width) {
    completeCrop.height = completeCrop.width / crop.aspect;
  }

  if (crop.height) {
    completeCrop.width = completeCrop.height * crop.aspect;
  }

  if (completeCrop.y + completeCrop.height > imageHeight) {
    completeCrop.height = imageHeight - completeCrop.y;
    completeCrop.width = completeCrop.height * crop.aspect;
  }

  if (completeCrop.x + completeCrop.width > imageWidth) {
    completeCrop.width = imageWidth - completeCrop.x;
    completeCrop.height = completeCrop.width / crop.aspect;
  }

  return completeCrop;
}

function convertToPercentCrop(crop, imageWidth, imageHeight) {
  if (crop.unit === "%") {
    return crop;
  }

  return {
    unit: "%",
    aspect: crop.aspect,
    x: (crop.x / imageWidth) * 100,
    y: (crop.y / imageHeight) * 100,
    width: (crop.width / imageWidth) * 100,
    height: (crop.height / imageHeight) * 100
  };
}

function convertToPixelCrop(crop, imageWidth, imageHeight) {
  if (!crop.unit) {
    return { ...crop, unit: "px" };
  }

  if (crop.unit === "px") {
    return crop;
  }

  return {
    unit: "px",
    aspect: crop.aspect,
    x: (crop.x * imageWidth) / 100,
    y: (crop.y * imageHeight) / 100,
    width: (crop.width * imageWidth) / 100,
    height: (crop.height * imageHeight) / 100
  };
}

function isAspectInvalid(crop, imageWidth, imageHeight) {
  if ((!crop.width && crop.height) || (crop.width && !crop.height)) {
    return true;
  }

  if (crop.y + crop.height > imageHeight || crop.x + crop.width > imageWidth) {
    return true;
  }

  // Allow a 1px tolerance due to %->px rounding.
  if (
    crop.width / crop.aspect < crop.height - 1 ||
    crop.width / crop.aspect > crop.height + 1
  ) {
    return true;
  }
  if (
    crop.height * crop.aspect < crop.width - 1 ||
    crop.height * crop.aspect > crop.width + 1
  ) {
    return true;
  }

  return false;
}

function resolveCrop(pixelCrop, imageWidth, imageHeight) {
  if (!pixelCrop) {
    return pixelCrop;
  }

  let fixedCrop = pixelCrop;
  const widthOverflows = pixelCrop.x + pixelCrop.width > imageWidth;
  const heightOverflows = pixelCrop.y + pixelCrop.height > imageHeight;

  if (widthOverflows && heightOverflows) {
    fixedCrop = {
      unit: "px",
      x: 0,
      y: 0,
      width: imageWidth > pixelCrop.width ? pixelCrop.width : imageWidth,
      height: imageHeight > pixelCrop.height ? pixelCrop.height : imageHeight
    };
  } else if (widthOverflows) {
    fixedCrop = {
      ...pixelCrop,
      x: 0,
      width: imageWidth > pixelCrop.width ? pixelCrop.width : imageWidth
    };
  } else if (heightOverflows) {
    fixedCrop = {
      ...pixelCrop,
      y: 0,
      height: imageHeight > pixelCrop.height ? pixelCrop.height : imageHeight
    };
  }

  if (fixedCrop.aspect && isAspectInvalid(fixedCrop, imageWidth, imageHeight)) {
    return makeAspectCrop(fixedCrop, imageWidth, imageHeight);
  }

  return fixedCrop;
}

function containCrop(prevCrop, crop, imageWidth, imageHeight) {
  const pixelCrop = convertToPixelCrop(crop, imageWidth, imageHeight);
  const prevPixelCrop = convertToPixelCrop(prevCrop, imageWidth, imageHeight);
  const contained = { ...pixelCrop };

  // Non-aspects are simple
  if (!pixelCrop.aspect) {
    if (pixelCrop.x < 0) {
      contained.x = 0;
      contained.width += pixelCrop.x;
    } else if (pixelCrop.x + pixelCrop.width > imageWidth) {
      contained.width = imageWidth - pixelCrop.x;
    }

    if (pixelCrop.y + pixelCrop.height > imageHeight) {
      contained.height = imageHeight - pixelCrop.y;
    }

    return contained;
  }

  let adjustedForX = false;

  if (pixelCrop.x < 0) {
    contained.x = 0;
    contained.width += pixelCrop.x;
    contained.height = contained.width / pixelCrop.aspect;
    adjustedForX = true;
  } else if (pixelCrop.x + pixelCrop.width > imageWidth) {
    contained.width = imageWidth - pixelCrop.x;
    contained.height = contained.width / pixelCrop.aspect;
    adjustedForX = true;
  }

  // If sizing in up direction we need to pin Y at the point it
  // would be at the boundary.
  if (adjustedForX && prevPixelCrop.y > contained.y) {
    contained.y = pixelCrop.y + (pixelCrop.height - contained.height);
  }

  let adjustedForY = false;

  if (contained.y + contained.height > imageHeight) {
    contained.height = imageHeight - pixelCrop.y;
    contained.width = contained.height * pixelCrop.aspect;
    adjustedForY = true;
  }

  // If sizing in left direction we need to pin X at the point it
  // would be at the boundary.
  if (adjustedForY && prevPixelCrop.x > contained.x) {
    contained.x = pixelCrop.x + (pixelCrop.width - contained.width);
  }

  return contained;
}

const ReactCrop = {
  props: {
    src: null,
    circularCrop: { default: false, type: Boolean },
    className: undefined,
    crop: null,
    crossorigin: undefined,
    disabled: { default: false, type: Boolean },
    locked: { default: false, type: Boolean },
    imageAlt: { default: "", type: String },
    maxWidth: undefined,
    maxHeight: undefined,
    minWidth: {
      type: Number,
      default: 0
    },
    minHeight: {
      type: Number,
      default: 0
    },
    keepSelection: { default: false, type: Boolean },
    onComplete: {
      type: Function,
      default: () => { }
    },
    onImageError: {
      type: Function,
      default: () => { }
    },
    onImageLoaded: {
      type: Function,
      default: () => { }
    },
    onDragStart: {
      type: Function,
      default: () => { }
    },
    onDragEnd: {
      type: Function,
      default: () => { }
    },
    onChange: {
      type: Function,
      default: () => { }
    },

    imgStyle: undefined,
    renderComponent: undefined,
    imageStyle: undefined,
    renderSelectionAddon: undefined,
    ruleOfThirds: { default: false, type: Boolean },
  },

  data() {
    return {
      mouseDownOnCrop: false,
      evData: {},
      cropIsActive: false,
      newCropIsBeingDrawn: false,
    };
  },

  mounted() {
    if (document.addEventListener) {
      const options = passiveSupported ? { passive: false } : false;

      document.addEventListener("mousemove", this.onDocMouseTouchMove, options);
      document.addEventListener("touchmove", this.onDocMouseTouchMove, options);

      document.addEventListener("mouseup", this.onDocMouseTouchEnd, options);
      document.addEventListener("touchend", this.onDocMouseTouchEnd, options);
      document.addEventListener(
        "touchcancel",
        this.onDocMouseTouchEnd,
        options
      );
    }
  },

  beforeDestroy() {
    if (document.removeEventListener) {
      document.removeEventListener("mousemove", this.onDocMouseTouchMove);
      document.removeEventListener("touchmove", this.onDocMouseTouchMove);

      document.removeEventListener("mouseup", this.onDocMouseTouchEnd);
      document.removeEventListener("touchend", this.onDocMouseTouchEnd);
      document.removeEventListener("touchcancel", this.onDocMouseTouchEnd);
    }
  },

  updated() {

    this.$nextTick(() => {
      // this.crop = { ...ReactCrop.defaultCrop, ...this.crop };
      if (this.$refs.imageRef) {
        const { width, height } = this.$refs.imageRef;
        const crop = this.makeNewCrop();
        const resolvedCrop = resolveCrop(crop, width, height);

        if (crop !== resolvedCrop) {
          const pixelCrop = convertToPixelCrop(resolvedCrop, width, height);
          const percentCrop = convertToPercentCrop(
            resolvedCrop,
            width,
            height
          );
          this.onChange(pixelCrop, percentCrop);
          this.onComplete(pixelCrop, percentCrop);
        }
      }
    });
  },

  methods: {
    componentDimensions() {
      const { clientWidth, clientHeight } = this.$refs.componentRef;
      return { width: clientWidth, height: clientHeight };
    },

    onCropMouseTouchDown(e) {
      const { disabled, crop } = this;
      const { width, height } = this.componentDimensions();
      const pixelCrop = convertToPixelCrop(crop, width, height);
      if (disabled) {
        return;
      }
      e.preventDefault(); // Stop drag selection.

      const clientPos = getClientPos(e);

      // Focus for detecting keypress.
      if (this.$refs.componentRef.setActive) {
        this.$refs.componentRef.setActive({ preventScroll: true }); // IE/Edge #289
      } else {
        this.$refs.componentRef.focus({ preventScroll: true }); // All other browsers
      }

      const { ord } = e.target.dataset;
      const xInversed = ord === "nw" || ord === "w" || ord === "sw";
      const yInversed = ord === "nw" || ord === "n" || ord === "ne";

      let cropOffset;

      if (pixelCrop.aspect) {
        cropOffset = this.getElementOffset(this.$refs.cropSelectRef);
      }

      this.evData = {
        clientStartX: clientPos.x,
        clientStartY: clientPos.y,
        cropStartWidth: pixelCrop.width,
        cropStartHeight: pixelCrop.height,
        cropStartX: xInversed ? pixelCrop.x + pixelCrop.width : pixelCrop.x,
        cropStartY: yInversed ? pixelCrop.y + pixelCrop.height : pixelCrop.y,
        xInversed,
        yInversed,
        xCrossOver: xInversed,
        yCrossOver: yInversed,
        startXCrossOver: xInversed,
        startYCrossOver: yInversed,
        isResize: e.target.dataset.ord,
        ord,
        cropOffset
      };


      this.mouseDownOnCrop = true;
      // this.setState({ cropIsActive: true });
      this.cropIsActive = true;
    },

    onComponentMouseTouchDown(e) {
      const { crop, disabled, locked, keepSelection, onChange } = this;

      const componentEl = this.$refs.mediaWrapperRef.firstChild;

      if (e.target !== componentEl || !componentEl.contains(e.target)) {
        return;
      }

      if (disabled || locked || (keepSelection && isCropValid(crop))) {
        return;
      }

      e.preventDefault(); // Stop drag selection.

      const clientPos = getClientPos(e);



      // Focus for detecting keypress.
      if (this.$refs.componentRef.setActive) {
        this.$refs.componentRef.setActive({ preventScroll: true }); // IE/Edge #289
      } else {
        this.$refs.componentRef.focus({ preventScroll: true }); // All other browsers
      }

      const imageOffset = this.getElementOffset(this.$refs.componentRef);
      const x = clientPos.x - imageOffset.left;
      const y = clientPos.y - imageOffset.top;


      const nextCrop = {
        unit: "px",
        aspect: crop ? crop.aspect : undefined,
        x,
        y,
        width: 0,
        height: 0
      };

      this.evData = {
        clientStartX: clientPos.x,
        clientStartY: clientPos.y,
        cropStartWidth: nextCrop.width,
        cropStartHeight: nextCrop.height,
        cropStartX: nextCrop.x,
        cropStartY: nextCrop.y,
        xInversed: false,
        yInversed: false,
        xCrossOver: false,
        yCrossOver: false,
        startXCrossOver: false,
        startYCrossOver: false,
        isResize: true,
        ord: "nw"
      };

      this.mouseDownOnCrop = true;

      const { width, height } = this.componentDimensions();


      onChange(
        convertToPixelCrop(nextCrop, width, height),
        convertToPercentCrop(nextCrop, width, height)
      );

      // this.setState({ cropIsActive: true, newCropIsBeingDrawn: true });
      this.cropIsActive = true;
      this.newCropIsBeingDrawn = true;
    },

    onDocMouseTouchMove(e) {
      const crop = { ...ReactCrop.defaultCrop, ...this.crop };
      const { disabled, onChange, onDragStart } = this;

      if (disabled) {
        return;
      }

      if (!this.mouseDownOnCrop) {
        return;
      }

      e.preventDefault(); // Stop drag selection.

      if (!this.dragStarted) {
        this.dragStarted = true;
        onDragStart(e);
      }

      const { evData } = this;
      const clientPos = getClientPos(e);

      if (evData.isResize && crop.aspect && evData.cropOffset) {
        clientPos.y = this.straightenYPath(clientPos.x);
      }

      evData.xDiff = clientPos.x - evData.clientStartX;
      evData.yDiff = clientPos.y - evData.clientStartY;

      let nextCrop;

      if (evData.isResize) {
        nextCrop = this.resizeCrop();
      } else {
        nextCrop = this.dragCrop();
      }

      if (nextCrop !== crop) {
        const { width, height } = this.componentDimensions();

        onChange(
          convertToPixelCrop(nextCrop, width, height),
          convertToPercentCrop(nextCrop, width, height)
        );
      }
    },

    onComponentKeyDown(e) {
      const { crop, disabled, onChange, onComplete } = this;

      if (disabled) {
        return;
      }

      const keyCode = e.key;
      let nudged = false;

      if (!isCropValid(crop)) {
        return;
      }

      const nextCrop = this.makeNewCrop();
      const nudgeStep = e.shiftKey
        ? ReactCrop.nudgeStepLarge
        : ReactCrop.nudgeStep;

      if (keyCode === "ArrowLeft") {
        nextCrop.x -= nudgeStep;
        nudged = true;
      } else if (keyCode === "ArrowRight") {
        nextCrop.x += nudgeStep;
        nudged = true;
      } else if (keyCode === "ArrowUp") {
        nextCrop.y -= nudgeStep;
        nudged = true;
      } else if (keyCode === "ArrowDown") {
        nextCrop.y += nudgeStep;
        nudged = true;
      }

      if (nudged) {
        e.preventDefault(); // Stop drag selection.
        const { width, height } = this.componentDimensions();

        nextCrop.x = clamp(nextCrop.x, 0, width - nextCrop.width);
        nextCrop.y = clamp(nextCrop.y, 0, height - nextCrop.height);

        const pixelCrop = convertToPixelCrop(nextCrop, width, height);
        const percentCrop = convertToPercentCrop(nextCrop, width, height);

        onChange(pixelCrop, percentCrop);
        onComplete(pixelCrop, percentCrop);
      }
    },

    onDocMouseTouchEnd(e) {
      const { crop, disabled, onComplete, onDragEnd } = this;

      if (disabled) {
        return;
      }

      if (this.mouseDownOnCrop) {
        this.mouseDownOnCrop = false;
        this.dragStarted = false;

        const { width, height } = this.componentDimensions();

        onDragEnd(e);
        onComplete(
          convertToPixelCrop(crop, width, height),
          convertToPercentCrop(crop, width, height)
        );

        // this.setState({ cropIsActive: false, newCropIsBeingDrawn: false });
        this.cropIsActive = false;
        this.newCropIsBeingDrawn = false;
      }
    },

    onImageLoad(image) {
      const { onComplete, onChange, onImageLoaded } = this;

      const crop = this.makeNewCrop();
      const resolvedCrop = resolveCrop(crop, image.width, image.height);

      // Return false from onImageLoaded if you set the crop with setState in there as otherwise
      // the subsequent onChange + onComplete will not have your updated crop.
      const res = onImageLoaded(image);

      if (res !== false) {
        const pixelCrop = convertToPixelCrop(
          resolvedCrop,
          image.width,
          image.height
        );
        const percentCrop = convertToPercentCrop(
          resolvedCrop,
          image.width,
          image.height
        );
        onChange(pixelCrop, percentCrop);
        onComplete(pixelCrop, percentCrop);
      }
    },

    getDocumentOffset() {
      const { clientTop = 0, clientLeft = 0 } = document.documentElement || {};
      return { clientTop, clientLeft };
    },

    getWindowOffset() {
      const { pageYOffset = 0, pageXOffset = 0 } = window;
      return { pageYOffset, pageXOffset };
    },

    getElementOffset(el) {
      const rect = el.getBoundingClientRect();
      const doc = this.getDocumentOffset();
      const win = this.getWindowOffset();

      const top = rect.top + win.pageYOffset - doc.clientTop;
      const left = rect.left + win.pageXOffset - doc.clientLeft;

      return { top, left };
    },

    getCropStyle() {
      const crop = this.makeNewCrop(this.crop ? this.crop.unit : "px");

      return {
        top: `${crop.y}${crop.unit}`,
        left: `${crop.x}${crop.unit}`,
        width: `${crop.width}${crop.unit}`,
        height: `${crop.height}${crop.unit}`
      };
    },

    getNewSize() {
      const { crop, minWidth, maxWidth, minHeight, maxHeight } = this;
      const { evData } = this;
      const { width, height } = this.componentDimensions();

      // New width.
      let newWidth = evData.cropStartWidth + evData.xDiff;

      if (evData.xCrossOver) {
        newWidth = Math.abs(newWidth);
      }

      newWidth = clamp(newWidth, minWidth, maxWidth || width);

      // New height.
      let newHeight;

      if (crop.aspect) {
        newHeight = newWidth / crop.aspect;
      } else {
        newHeight = evData.cropStartHeight + evData.yDiff;
      }

      if (evData.yCrossOver) {
        // Cap if polarity is inversed and the height fills the y space.
        newHeight = Math.min(Math.abs(newHeight), evData.cropStartY);
      }

      newHeight = clamp(newHeight, minHeight, maxHeight || height);

      if (crop.aspect) {
        newWidth = clamp(newHeight * crop.aspect, 0, width);
      }

      return {
        width: newWidth,
        height: newHeight
      };
    },

    dragCrop() {
      const nextCrop = this.makeNewCrop();
      const { evData } = this;
      const { width, height } = this.componentDimensions();

      nextCrop.x = clamp(
        evData.cropStartX + evData.xDiff,
        0,
        width - nextCrop.width
      );
      nextCrop.y = clamp(
        evData.cropStartY + evData.yDiff,
        0,
        height - nextCrop.height
      );

      return nextCrop;
    },

    resizeCrop() {
      const { evData } = this;
      const nextCrop = this.makeNewCrop();
      const { ord } = evData;

      // On the inverse change the diff so it's the same and
      // the same algo applies.
      if (evData.xInversed) {
        evData.xDiff -= evData.cropStartWidth * 2;
        evData.xDiffPc -= evData.cropStartWidth * 2;
      }
      if (evData.yInversed) {
        evData.yDiff -= evData.cropStartHeight * 2;
        evData.yDiffPc -= evData.cropStartHeight * 2;
      }

      // debugger

      // New size.
      const newSize = this.getNewSize();

      // Adjust x/y to give illusion of 'staticness' as width/height is increased
      // when polarity is inversed.
      let newX = evData.cropStartX;
      let newY = evData.cropStartY;

      if (evData.xCrossOver) {
        newX = nextCrop.x + (nextCrop.width - newSize.width);
      }

      if (evData.yCrossOver) {
        // This not only removes the little "shake" when inverting at a diagonal, but for some
        // reason y was way off at fast speeds moving sw->ne with fixed aspect only, I couldn't
        // figure out why.
        if (evData.lastYCrossover === false) {
          newY = nextCrop.y - newSize.height;
        } else {
          newY = nextCrop.y + (nextCrop.height - newSize.height);
        }
      }

      const { width, height } = this.componentDimensions();
      const containedCrop = containCrop(
        this.crop,
        {
          unit: nextCrop.unit,
          x: newX,
          y: newY,
          width: newSize.width,
          height: newSize.height,
          aspect: nextCrop.aspect
        },
        width,
        height
      );

      // Apply x/y/width/height changes depending on ordinate (fixed aspect always applies both).
      if (nextCrop.aspect || ReactCrop.xyOrds.indexOf(ord) > -1) {
        nextCrop.x = containedCrop.x;
        nextCrop.y = containedCrop.y;
        nextCrop.width = containedCrop.width;
        nextCrop.height = containedCrop.height;
      } else if (ReactCrop.xOrds.indexOf(ord) > -1) {
        nextCrop.x = containedCrop.x;
        nextCrop.width = containedCrop.width;
      } else if (ReactCrop.yOrds.indexOf(ord) > -1) {
        nextCrop.y = containedCrop.y;
        nextCrop.height = containedCrop.height;
      }

      evData.lastYCrossover = evData.yCrossOver;
      this.crossOverCheck();

      return nextCrop;
    },

    straightenYPath(clientX) {
      const { evData } = this;
      const { ord } = evData;
      const { cropOffset, cropStartWidth, cropStartHeight } = evData;
      let k;
      let d;

      if (ord === "nw" || ord === "se") {
        k = cropStartHeight / cropStartWidth;
        d = cropOffset.top - cropOffset.left * k;
      } else {
        k = -cropStartHeight / cropStartWidth;
        d = cropOffset.top + (cropStartHeight - cropOffset.left * k);
      }

      return k * clientX + d;
    },

    createCropSelection(h) {
      const { disabled, locked, renderSelectionAddon, ruleOfThirds } = this;
      const style = this.getCropStyle();

      return h(
        "div",
        {
          ref: "cropSelectRef",
          style,
          class: "ReactCrop__crop-selection",
          attrs: {
            tabIndex: "0"
          },
          on: {
            mousedown: this.onCropMouseTouchDown,
            touchstart: this.onCropMouseTouchDown
          }
        },
        [
          !disabled &&
          !locked &&
          h(
            "div",
            {
              class: "ReactCrop__drag-elements",
              attrs: {
                "data-ord": "n"
              }
            },
            [
              ...["n", "e", "s", "w"].map(s => {
                return h(
                  "div",
                  {
                    class: `ReactCrop__drag-bar ord-${s}`,
                    attrs: {
                      "data-ord": s
                    }
                  },
                  []
                );
              }),
              ...["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(s => {
                return h(
                  "div",
                  {
                    class: `ReactCrop__drag-handle ord-${s}`,
                    attrs: {
                      "data-ord": s
                    }
                  },
                  []
                );
              })
            ]
          ),
          renderSelectionAddon &&
          h(
            "div",
            {
              class: "ReactCrop__selection-addon",
              on: {
                mousedown: e => e.stopPropagation()
              }
            },
            [renderSelectionAddon(this)]
          ),
          ruleOfThirds && ([
            h(
              "div",
              {
                class: "ReactCrop__rule-of-thirds-hz"
              },
              []
            ),
            h(
              "div",
              {
                class: "ReactCrop__rule-of-thirds-vt"
              },
              []
            )]
          )
        ]
      );
    },

    makeNewCrop(unit = "px") {
      const crop = { ...ReactCrop.defaultCrop, ...this.crop };
      const { width, height } = this.componentDimensions();

      return unit === "px"
        ? convertToPixelCrop(crop, width, height)
        : convertToPercentCrop(crop, width, height);
    },

    crossOverCheck() {
      const { evData } = this;
      const { minWidth, minHeight } = this;

      if (
        !minWidth &&
        ((!evData.xCrossOver &&
          -Math.abs(evData.cropStartWidth) - evData.xDiff >= 0) ||
          (evData.xCrossOver &&
            -Math.abs(evData.cropStartWidth) - evData.xDiff <= 0))
      ) {
        evData.xCrossOver = !evData.xCrossOver;
      }

      if (
        !minHeight &&
        ((!evData.yCrossOver &&
          -Math.abs(evData.cropStartHeight) - evData.yDiff >= 0) ||
          (evData.yCrossOver &&
            -Math.abs(evData.cropStartHeight) - evData.yDiff <= 0))
      ) {
        evData.yCrossOver = !evData.yCrossOver;
      }

      const swapXOrd = evData.xCrossOver !== evData.startXCrossOver;
      const swapYOrd = evData.yCrossOver !== evData.startYCrossOver;

      evData.inversedXOrd = swapXOrd ? inverseOrd(evData.ord) : false;
      evData.inversedYOrd = swapYOrd ? inverseOrd(evData.ord) : false;
    }
  },

  render(h) {
    const {
      // children,
      circularCrop,
      className,
      crossorigin,
      crop,
      disabled,
      locked,
      imageAlt,
      onImageError,
      renderComponent,
      src,
      imgStyle,
      imageStyle,
      ruleOfThirds
    } = this;

    // let children = this.$children;

    const { cropIsActive, newCropIsBeingDrawn } = this;

    const cropSelection =
      isCropValid(crop) && this.$refs.componentRef
        ? this.createCropSelection(h)
        : null; //


    const componentClasses = clsx("ReactCrop", className, {
      "ReactCrop--active": cropIsActive,
      "ReactCrop--disabled": disabled,
      "ReactCrop--locked": locked,
      "ReactCrop--new-crop": newCropIsBeingDrawn,
      "ReactCrop--fixed-aspect": crop && crop.aspect,
      // In this case we have to shadow the image, since the box-shadow on the crop won't work.
      "ReactCrop--crop-invisible":
        crop && cropIsActive && (!crop.width || !crop.height),
      "ReactCrop--circular-crop": crop && circularCrop,
      "ReactCrop--rule-of-thirds": crop && ruleOfThirds
    });

    return h(
      "div",
      {
        ref: "componentRef",
        style: imgStyle,
        class: componentClasses,
        attrs: {
          tabIndex: "0"
        },
        on: {
          touchstart: this.onComponentMouseTouchDown,
          mousedown: this.onComponentMouseTouchDown,
          keydown: this.onComponentKeyDown
        }
      },
      [
        h(
          "div",
          {
            ref: "mediaWrapperRef"
          },
          [
            renderComponent ||
            h("img", {
              ref: "imageRef",
              class: "ReactCrop__image",
              style: imageStyle,
              props: {},
              attrs: {
                crossOrigin: crossorigin,
                src: src,
                alt: imageAlt
              },
              on: {
                load: e => this.onImageLoad(e.target),
                error: onImageError
              }
            })
          ]
        ),
        this.$slots.default,
        cropSelection
        //
      ]
    );
  }
};

ReactCrop.xOrds = ["e", "w"];
ReactCrop.yOrds = ["n", "s"];
ReactCrop.xyOrds = ["nw", "ne", "se", "sw"];

ReactCrop.nudgeStep = 0.2;
ReactCrop.nudgeStepLarge = 2;

ReactCrop.defaultCrop = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  unit: "px"
};

ReactCrop.props.crop = ReactCrop.defaultCrop;

export default ReactCrop;
