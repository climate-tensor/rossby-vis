### **迁移计划：对 `earth` 项目的现代化与致敬**

**核心理念：** 本次迁移的目标不仅仅是切换到 Svelte/TypeScript，而是要将原项目中经过实战检验的**核心设计模式和算法**，用现代化、类型安全且更易于维护的方式重新实现。我们必须保留其灵魂。

**指导原则：**

1.  **尊重异步代理模型 (Agent Model)**：`newAgent` 是整个应用响应式数据流的基石，它优雅地解决了竞态问题。我们必须复现这个模式。
2.  **保留渲染管线的职责分离**：SVG 地理层、Canvas 数据层、Canvas 动画层各司其职，这个设计必须得到保留。
3.  **坚守科学准确性**：`distortion` 畸变校正算法是项目科学性的关键，绝不能丢失或简化。
4.  **继承性能优化策略**：如拖拽时使用低分辨率地图、可视区域遮罩（Masking）、粒子绘制分桶（Bucketing）等，这些都是流畅体验的保证。

---

### **第一阶段：核心抽象与架构基础**

此阶段的目标是重建项目的骨架，将原作者的核心思想用 TypeScript 的接口和类进行抽象。

**1.1. 状态管理与路由 (`/lib/stores.ts`)**
* **目标**：再现 `micro.js` 中 `Configuration` 模型的强大功能。
* **行动**：
    * 使用 Svelte Stores 来管理应用的所有状态（日期、参数、投影、图层等）。
    * 创建一个专门的 `syncWithUrl` 响应式函数，**双向同步** Store 中的状态和浏览器的 URL hash。
    * **关键细节**：必须完整复现 `parse` 和 `toHash` 的逻辑，确保 URL 的可读性、可分享性以及浏览器的后退/前进功能可以无缝工作。

**1.2. 异步流程控制 (`/lib/control/agent.ts`)**
* **目标**：将 `newAgent` 迁移为一个现代化的、可重用的 TypeScript 类或高阶函数。
* **行动**：
    * 创建一个通用的 `Agent<T>` 类，它应具备 `submit()`, `cancel()` 方法，并能发出 `submit`, `update`, `reject` 等事件。
    * **关键细节**：要保留其**核心的自动取消机制**——当新的任务提交时，前一个进行中的任务必须能被取消。这将是后续所有数据加载和处理流程的控制器。

**1.3. 数据产品抽象 (`/lib/products/`)**
* **目标**：以类型安全的方式，重现 `products.js` 的工厂模式。
* **行动**：
    * 创建一个 `Product` 的 TypeScript **接口（Interface）**，明确定义一个数据产品应有的属性，如 `id`, `description`, `units`, `scale`, `particles`，以及最重要的 `buildGrid()` 方法。
    * 为每种数据类型（如 `wind`, `temperature`）创建独立的模块，实现 `Product` 接口。
    * **关键细节**：`buildGrid()` 方法的职责是加载数据并返回一个包含 `interpolate(lon, lat)` 方法的 `Grid` 对象。这忠实地保留了原设计的**数据封装**思想。

**1.4. 地球模型抽象 (`/lib/globes/`)**
* **目标**：将 `globes.js` 中 `standardGlobe` 的丰富 API 抽象为接口。
* **行动**：
    * 创建一个 `Globe` 接口，定义其必须实现的方法，包括：`projection`, `bounds`, `orientation`, `manipulator`。
    * **关键细节**：接口中**必须包含 `defineMask()`**。这个函数是后续渲染优化的基础，绝不能遗漏。同时，`orientation` 的序列化/反序列化逻辑也要保留，以支持状态保存。
    * 为每种投影（`orthographic`, `equirectangular` 等）创建实现 `Globe` 接口的类。

---

### **第二阶段：实现核心渲染管线**

此阶段将聚焦于将数据处理并转化为可视元素的计算密集型任务。

**2.1. 渲染管线协调器 (`Earth.svelte`)**
* **目标**：创建一个 Svelte 组件作为所有渲染的“大脑”。
* **行动**：
    * 该组件负责初始化并管理底层的 SVG 和多个 Canvas 元素。
    * 它将**实例化并驱动**多个 `Agent`，例如 `gridAgent` (用于加载数据) 和 `fieldAgent` (用于插值)。
    * 它将监听 `/lib/stores.ts` 中的状态变化，并将变化传递给对应的 Agent 以触发新的数据处理流程。

**2.2. SVG 地理渲染器 (`/lib/renderers/svg-renderer.ts`)**
* **目标**：专门负责所有基于 SVG 的地理元素绘制。
* **行动**：
    * 创建一个模块，接收一个 `Globe` 对象和 SVG 元素作为输入。
    * 负责绘制海岸线 (`coastline`)、经纬网格 (`graticule`)。
    * **关键细节**：必须实现**交互性能优化**。监听 `manipulator` 的 `moveStart`/`moveEnd` 事件，在拖拽时切换到低分辨率的 TopoJSON 数据，结束后再切换回高分辨率数据。

**2.3. 数据场插值器 (`/lib/renderers/field-interpolator.ts`)**
* **目标**：忠实、高效地再现 `earth.js` 中 `interpolateField` 的全部逻辑。这是整个迁移**最关键、最复杂**的一步。
* **行动**：
    * 这个模块的函数将作为 `fieldAgent` 的核心任务来执行。
    * **输入**：一个 `Globe` 对象和一个 `Grid` 对象。
    * **流程**：
        1.  使用 `globe.defineMask()` 获取可视区域，**跳过所有不必要的像素计算**。
        2.  遍历可视像素，通过 `projection.invert()` 获取经纬度。
        3.  调用 `grid.interpolate()` 执行**双线性插值**，获得原始数据矢量 `[u, v]`。
        4.  **执行 `distortion()` 投影畸变校正**，获得视觉上正确的屏幕空间矢量。
        5.  计算叠加层颜色，并将结果写入一个 `ImageData` 对象。
    * **现代化改进**：将整个插值任务封装在一个 **Web Worker** 中运行。这能彻底将主线程从这个计算密集型任务中解放出来，是相比原作的重大性能提升。
    * **输出**：一个 `Field` 对象，包含**校正后的矢量场**和**预渲染好的叠加层 `ImageData`**。

---

### **第三阶段：动画、合成与最终集成**

此阶段负责将计算好的数据以高性能的方式呈现出来。

**3.1. 粒子动画器 (`/lib/renderers/particle-animator.ts`)**
* **目标**：再现 `earth.js` 中 `animate` 函数的高效动画逻辑。
* **行动**：
    * 创建一个模块，**接收第二阶段生成的 `Field` 对象**作为输入。
    * 动画循环（`requestAnimationFrame`）的每一帧**只做两件事**：
        1.  `evolve()`：查询 `Field` 对象中预先计算好的矢量来更新粒子位置。
        2.  `draw()`：绘制粒子轨迹。
    * **关键细节**：必须重新实现**粒子分桶（Bucketing）**优化，根据粒子颜色（速度）进行批量绘制，以最小化 Canvas 的状态切换。同时，也要保留经典的“淡出”效果（`fadeFillStyle`）。

**3.2. 最终合成与展示 (`Earth.svelte`)**
* **目标**：将所有渲染层正确地叠加在一起。
* **行动**：
    * `Earth.svelte` 组件在接收到 `fieldAgent` 生成的 `Field` 对象后：
        1.  调用 `svg-renderer` 绘制底层的地理 SVG。
        2.  将 `Field.imageData` 通过 `putImageData` “贴”到数据层 Canvas 上。
        3.  启动 `particle-animator` 在最上层的 Canvas 中绘制动画。
