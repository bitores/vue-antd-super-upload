<template>
  <div id="app">
    fffab
    <image-crop
      src="http://img5.imgtn.bdimg.com/it/u=1585719800,235797657&fm=26&gp=0.jpg"
      ruleOfThirds
      :onImageLoaded="onImageLoaded"
      :onComplete="onCropComplete"
      :onChange="onCropChange"
      :onDragStart="onDragStart"
      :onDragEnd="onDragEnd"
      :ruleOfThirds="true"
      :crop="crop"
    ></image-crop>
  </div>
</template>

<script>
import ImageCrop from "./src/lib-components/image-crop";
export default {
  name: "App",
  components: {
    imageCrop: ImageCrop
  },
  data() {
    return {
      crop: {
        // unit: "px",
        // width: 160,
        // height: 90,
        // aspect: 16 / 9
        unit: "%",
        width: 30,
        aspect: 16 / 9
      }
    };
  },
  methods: {
    onImageLoaded() {
      console.log(1);
    },
    onCropComplete() {
      console.log(2);
    },
    onCropChange(v) {
      console.log("onCropChange", v);
      this.crop = v;
    },
    onDragStart() {
      console.log(4);
    },
    onDragEnd() {
      console.log(6);
    }
  }
};
</script>

<style>
#app {
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
