<template>
  <div class="placeholder-editor">
    <div class="placeholder-title">
      <div class="placeholder-line placeholder-line--60"></div>
    </div>

    <div class="placeholder-block">
      <div v-for="n in 7" :key="`p-1-${n}`" class="placeholder-line"></div>
      <div class="placeholder-line placeholder-line--60"></div>
    </div>

    <div class="placeholder-block placeholder-block--narrow">
      <div v-for="n in 6" :key="`p-2-${n}`" class="placeholder-line placeholder-line--30"></div>
    </div>

    <div class="placeholder-block">
      <div class="placeholder-line placeholder-line--60"></div>
      <div v-for="n in 7" :key="`p-3-${n}`" class="placeholder-line"></div>
      <div class="placeholder-line placeholder-line--30"></div>
    </div>

    <div class="placeholder-block placeholder-block--tail">
      <div v-for="n in 8" :key="`p-4-${n}`" class="placeholder-line"></div>
      <div class="placeholder-line placeholder-line--70"></div>
    </div>
  </div>
</template>

<style scoped>
.placeholder-editor {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  border-radius: 8px;
  background-color: #fff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 1in;
}

.placeholder-title {
  display: flex;
  justify-content: center;
}

.placeholder-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.placeholder-line {
  width: 100%;
  height: 16px;
  border-radius: 2px;
  background-color: #ebebeb;
}

.placeholder-line--30 {
  width: 30%;
}

.placeholder-line--60 {
  width: 60%;
}

.placeholder-line--70 {
  width: 70%;
}
</style>
