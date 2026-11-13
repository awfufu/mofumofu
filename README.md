# mofumofu

GPT 6 Astra 使用 HTML、SVG、CSS 和原生 JavaScript 制作的角色互动网页，呈现类似 Live2D 的动态效果。

效果预览 → [awfufu.github.io/mofumofu](https://awfufu.github.io/mofumofu)

## 图片来源

角色绘制参考：[原始图片](77430497_p5.jpg)

原图版权归[原作者](https://www.pixiv.net/artworks/77430497)所有。

## 实现方式

- 参考原图，用 SVG 路径和渐变重新绘制角色，将头部、眼睛、耳朵、头发、身体与尾巴等拆分为独立图层；页面中的角色全部由矢量图形组成。
- 通过 `requestAnimationFrame` 更新各图层的位移、旋转与缩放，结合平滑插值和弹簧阻尼，实现鼠标跟随、呼吸、耳朵与发梢的惯性摆动。
- 使用眼睑遮罩实现眨眼，监听鼠标或触摸事件，实现按压头顶、点击眼睛和耳朵，以及尾巴的闪避、下压与抖动。

这是基于 SVG 的 Live2D 风格动画，不依赖 Live2D SDK。
