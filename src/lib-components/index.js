import { Upload, Modal, message } from "ant-design-vue";
import ReactCrop from "image-crop";

import "./index.less";
try {
  new File([], "");
} catch (e) {
  // 兼容 IE new File()
  // import('canvas-toBlob').then(() => {
  //   /* eslint-disable-next-line */
  //   File = class File extends Blob {
  //     constructor(chunks, filename, opts = {}) {
  //       super(chunks, opts);
  //       this.lastModifiedDate = new Date();
  //       this.lastModified = +this.lastModifiedDate;
  //       this.name = filename;
  //     }
  //   };
  // });
}

const { Dragger } = Upload;

function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// limit: 限制单次最多上传数量，nzMultiple 打开时有效；0 表示不限
// size: 限制文件大小，单位：KB；0 表示不限
// fileType: 限制文件类型，例如：image/png,image/jpeg,image/gif,image/bmp
// filter: 自定义过滤器
// showButton 是否展示上传按钮

const Uploader = {
  props: {
    fileType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    minWidth: { type: Number, default: 0 },
    minHeight: { type: Number, default: 0 },
    maxWidth: { type: Number, default: 0 },
    maxHeight: { type: Number, default: 0 },
    enCrop: { type: Boolean, default: false },
    enDrag: { type: Boolean, default: false },
    filter: { type: Array, default: [] },

    //crop
    cropWidth: { type: Number },
    cropHeight: { type: Number },
    useRatio: { type: Boolean, default: false },
    cropResize: { type: Boolean, default: true },
    cropResizeAndDrag: { type: Boolean, default: true },

    cropModalTitle: { type: String, default: "图片裁剪" },
    cropModalWidth: { type: Number, default: 520 },
    beforeCrop: { type: Function },

    // children: PropTypes.node
  },

  data() {
    return {
      filters: [],
      // 预览
      previewVisible: false,
      previewImage: "",
      // 正常数据
      fileList: props.value || [],
      showButton: true,
      //
      cropModalVisible: false,
      cropImageSrc: null,
      cropData: {}
    }
  },

  mounted() {

    this.uploadRef = React.createRef();

    this.imageCount = 0;
    this.filters = [];
    const { fileType, fileTypeErrorTip = "不支持该文件格式" } = this.$props;
    if (fileType) {
      this.filters.push({
        name: "type",
        fn: fileList => {
          if (fileType.length === 0) {
            return true;
          }
          let types = fileType.split(",");
          let filterFiles = fileList.filter(f => types.indexOf(f.type) > -1);

          if (filterFiles.length !== fileList.length) {
            message.error(fileTypeErrorTip);
            return false;
          }

          return true;
        }
      });
    }

    const { enCrop = false, size, sizeErrorTip = "文件超出限定值" } = this.$props;

    if (size && enCrop === false) {
      this.filters.push({
        name: "size",
        fn: fileList => {
          if (size === 0) {
            return true;
          }

          let filterFiles = fileList.filter(f => f.size <= size);

          if (filterFiles.length !== fileList.length) {
            message.error(sizeErrorTip);
            return false;
          }

          return true;
        }
      });
    }

    const {
      minWidth = 0,
      minHeight = 0,
      maxWidth = 0,
      maxHeight = 0,
      whErrorTip = "文件宽高超不符合要求"
    } = this.$props;
    if ((maxWidth || maxHeight || minWidth || minHeight) && enCrop === false) {
      this.filters.push({
        name: "check width height",
        fn: fileList => {
          return new Promise((resolve, reject) => {
            let filereader = new FileReader();
            filereader.onload = e => {
              let src = e.target.result;
              const image = new Image();
              image.onload = function () {
                const { naturalWidth, naturalHeight } = this;

                if (
                  (maxWidth !== 0 && naturalWidth > maxWidth) ||
                  (minWidth !== 0 && naturalWidth < minWidth) ||
                  (maxHeight !== 0 && naturalHeight > maxHeight) ||
                  (minHeight !== 0 && naturalHeight < minHeight)
                ) {
                  message.error(whErrorTip);
                  reject();
                } else {
                  resolve();
                }
              };
              image.onerror = reject;
              image.src = src;
            };
            filereader.readAsDataURL(fileList[0]);
          });
        }
      });
    }

    this.filters.push(...(props.filter || []));
  },
  methods: {
    handleCancelPreview() {
      this.previewVisible = false;
    },
    async handlePreview(file) {
      if (!file.url && !file.preview) {
        file.preview = await getBase64(file.originFileObj);
      }

      this.previewImage = file.url || file.preview;
      this.previewVisible = true;
    },

    //
    async onCropOk() {
      let { x, y, width, height } = this.cropData;

      if (!width || !height) {
        this.onClose();
        return;
      }

      if (this.scale !== undefined) {
        x = x * this.scale;
        y = y * this.scale;
        width = width * this.scale;
        height = height * this.scale;
      }

      // 获取裁切后的图片
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(this.imageRef, x, y, width, height, 0, 0, width, height);

      const { name, type, uid } = this.originalFile;
      canvas.toBlob(async blob => {
        // 生成新图片
        const croppedFile = new File([blob], name, {
          type,
          lastModified: Date.now()
        });
        croppedFile.uid = uid;

        // 关闭弹窗
        this.onCropClose();

        const { beforeUpload = () => true } = this.props;
        // 调用 beforeUpload
        const response = beforeUpload(croppedFile, [croppedFile]);

        if (response === false) {
          this.reject();
          return;
        }

        if (typeof response.then !== "function") {
          this.resolve(croppedFile);
          return;
        }

        try {
          const croppedProcessedFile = await response;
          const fileType = Object.prototype.toString.call(croppedProcessedFile);
          const useProcessedFile =
            fileType === "[object File]" || fileType === "[object Blob]";

          this.resolve(useProcessedFile ? croppedProcessedFile : croppedFile);
        } catch (err) {
          this.reject(err);
        }
      }, type);
    },

    onCropClose() {
      this.imageRef = undefined;
      this.scale = undefined;

      //
      this.cropModalVisible = false;
      this.cropData = {};
    },

    onCropChange(cropData) {
      this.cropData = cropData;
    },

    onCropImageLoaded(image) {
      if (this.imageRef !== undefined) return;

      this.imageRef = image;
      const { naturalWidth, naturalHeight } = this.imageRef;
      let imgWidth = naturalWidth;
      let imgHeight = naturalHeight;

      const { cropModalWidth, cropWidth, cropHeight, useRatio } = this.props;

      const modalBodyWidth = cropModalWidth - 24 * 2;
      if (naturalWidth > modalBodyWidth) {
        imgWidth = modalBodyWidth;
        this.scale = naturalWidth / imgWidth;
        imgHeight = naturalHeight / this.scale;
      }

      const aspect = cropWidth / cropHeight;
      let x;
      let y;
      let width;
      let height;

      if (useRatio === true) {
        const naturalAspect = naturalWidth / naturalHeight;
        if (naturalAspect > aspect) {
          y = 0;
          height = imgHeight;
          width = height * aspect;
          x = (imgWidth - width) / 2;
        } else {
          x = 0;
          width = imgWidth;
          height = width / aspect;
          y = (imgHeight - height) / 2;
        }
      } else {
        x = (imgWidth - cropWidth) / 2;
        y = (imgHeight - cropHeight) / 2;
        width = cropWidth;
        height = cropHeight;
      }

      this.cropData = { unit: "px", aspect, x, y, width, height }
      return false;
    }
  },



  render(h) {
    const {
      filters,
      previewVisible,
      previewImage,
      //
      fileList,
      showButton = true,
      //
      cropModalVisible,
      cropImageSrc,
      cropData
    } = this;

    const {
      children,
      max = 0,
      filter,
      onChange,
      beforeUpload,
      onRemove,
      // crop
      multiple,
      enCrop = false,
      cropModalTitle,
      cropModalWidth,
      cropResize,
      cropResizeAndDrag,
      enDrag = false,
      ...uploadProp
    } = this.$props;

    let UploadComponent = enDrag ? Dragger : Upload;


    return h(
      UploadComponent,
      {

      }, [
      (max == 0 || fileList.length < max) && this.$slots.default
    ]
    )
    // return (
    //   <Fragment>
    //     <UploadComponent
    //       ref={this.uploadRef}
    //       fileList={fileList}
    //       multiple={enCrop === true ? false : multiple}
    //       onChange={({ fileList }) => {
    //         let needShowButton = true
    //         if (max === 0 || fileList.length < max) {
    //           needShowButton = true;
    //         } else {
    //           needShowButton = false;
    //         }
    //         if (max !== 0) {
    //           fileList.splice(max);
    //         }

    //         onChange && onChange(fileList);
    //         this.setState({
    //           fileList: fileList,
    //           showButton: needShowButton
    //         });
    //       }}
    //       beforeUpload={(file, fileList) => {
    //         this.imageCount++;
    //         let tasks = [];
    //         for (let i = 0, len = filters.length; i < len; i++) {
    //           let f = filters[i];
    //           let r = f.fn([file]);

    //           if (r instanceof Promise) {
    //             tasks.push(r);
    //           } else if (!!r === false) {
    //             tasks.push(Promise.reject());
    //           } else {
    //             tasks.push(Promise.resolve());
    //           }
    //         }

    //         return new Promise((resolve, reject) => {
    //           this.resolve = resolve;
    //           this.reject = reject;
    //           Promise.all(tasks).then(() => {
    //             // 进行剪切控制
    //             const { enCrop = false } = this.props;
    //             if (enCrop) {
    //               this.originalFile = file;
    //               // 读取添加的图片
    //               const reader = new FileReader();
    //               reader.addEventListener("load", () => {
    //                 this.setState({
    //                   cropModalVisible: true,
    //                   cropImageSrc: reader.result
    //                 });
    //               });
    //               reader.readAsDataURL(this.originalFile);
    //             } else {
    //               resolve(file);
    //             }
    //           });
    //         });
    //       }}
    //       onRemove={file => {
    //         this.imageCount--;
    //         onChange && onChange(this.state.fileList);
    //         return true;
    //       }}
    //       onPreview={this.handlePreview}
    //       {...uploadProp}
    //     >
    //       {(max == 0 || fileList.length < max) && children}
    //     </UploadComponent>
    //     <Modal
    //       visible={cropModalVisible}
    //       width={cropModalWidth}
    //       onOk={this.onCropOk}
    //       onCancel={this.onCropClose}
    //       wrapClassName="antd-img-crop-modal"
    //       title={cropModalTitle || "编辑图片"}
    //       maskClosable={false}
    //       destroyOnClose
    //     >
    //       {cropImageSrc && (
    //         <ReactCrop
    //           src={cropImageSrc}
    //           crop={cropData}
    //           locked={cropResize === false}
    //           disabled={cropResizeAndDrag === false}
    //           onImageLoaded={this.onCropImageLoaded}
    //           onChange={this.onCropChange}
    //           keepSelection
    //         />
    //       )}
    //     </Modal>
    //     <Modal
    //       visible={previewVisible}
    //       footer={null}
    //       onCancel={this.handleCancelPreview}
    //     >
    //       <img alt="预览图片" style={{ width: "100%" }} src={previewImage} />
    //     </Modal>
    //   </Fragment>
    );
  }
}

export default Uploader;