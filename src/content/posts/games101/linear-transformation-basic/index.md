---
title: "GAMES101 Lecture 02-03 线性代数与图形变换基础"
published: 2026-05-13
description: "计算机图形学需要把“看见的几何”转成“可计算的代数”。点、方向、法线、相机、模型姿态和屏幕坐标都要通过向量与矩阵表达；渲染管线中的旋转、缩放、平移、投影，本质上是在不同坐标系之间移动几何数据。"
tags: ["计算机图形学","GAMES101"]
category: "计算机图形学"
draft: false
sourceLink: "https://www.bilibili.com/video/BV1X7411F744?p=3"
---

<!-- synced-from-obsidian -->
# GAMES101 1-线性代数与图形变换基础

## 核心问题/Motivation

计算机图形学需要把“看见的几何”转成“可计算的代数”。点、方向、法线、相机、模型姿态和屏幕坐标都要通过向量与矩阵表达；渲染管线中的旋转、缩放、平移、投影，本质上是在不同坐标系之间移动几何数据。

## 定义

### 定义 1（向量）

向量表示方向与长度，常写作列向量：

$$
\mathbf{v}=\begin{bmatrix}x\\y\\z\end{bmatrix}, \qquad
\|\mathbf{v}\|=\sqrt{x^2+y^2+z^2}
$$

单位向量为：

$$
\hat{\mathbf{v}}=\frac{\mathbf{v}}{\|\mathbf{v}\|}
$$

> [!note] 直觉理解
> 点描述“在哪里”，向量描述“往哪里、走多远”。
> **两个点相减**得到向量，**点加向量**得到新的点。

### 定义 2（点乘）

**陈述**：

$$
\mathbf{a}\cdot\mathbf{b}=a_xb_x+a_yb_y+a_zb_z=\|\mathbf{a}\|\|\mathbf{b}\|\cos\theta
$$

点乘的结果是标量，用来衡量两个方向的一致程度。

GAMES101 向量点乘与投影.relationship

**常用结论**：

| 条件 | 几何含义 |
|---|---|
| $\mathbf{a}\cdot\mathbf{b}>0$ | 夹角小于 $90^\circ$，方向大体一致 |
| $\mathbf{a}\cdot\mathbf{b}=0$ | 两向量正交 |
| $\mathbf{a}\cdot\mathbf{b}<0$ | 夹角大于 $90^\circ$，方向大体相反 |

> [!warning] 易错点
> 点乘不是向量乘法，它的结果没有方向。若需要法线、朝向或面积，应使用叉乘。

### 定义 3（叉乘）

**陈述**：三维向量叉乘得到一个垂直于二者所在平面的向量：

$$
\mathbf{a}\times\mathbf{b}=\begin{bmatrix}
a_yb_z-a_zb_y\\
a_zb_x-a_xb_z\\
a_xb_y-a_yb_x
\end{bmatrix}
$$

其长度为：

$$
\|\mathbf{a}\times\mathbf{b}\|=\|\mathbf{a}\|\|\mathbf{b}\|\sin\theta
$$

GAMES101 叉乘与右手系.relationship

**核心用途**：

- 生成三角形或平面的法线方向。
- 用平行四边形面积解释 $\|\mathbf{a}\times\mathbf{b}\|$。
- 通过符号判断左右、内外、顺逆时针等朝向关系。

> [!warning] 易错点
> 叉乘不满足交换律：$\mathbf{a}\times\mathbf{b}=-(\mathbf{b}\times\mathbf{a})$。交换输入顺序会翻转法线方向，这会影响背面剔除、光照和三角形内外判断。

### 定义 4（矩阵与线性变换）

矩阵可以看作对向量的函数。二维线性变换常写作：

$$
\begin{bmatrix}x'\\y'\end{bmatrix}
=
\begin{bmatrix}a&b\\c&d\end{bmatrix}
\begin{bmatrix}x\\y\end{bmatrix}
$$

常见矩阵：

$$
R(\theta)=
\begin{bmatrix}
\cos\theta&-\sin\theta\\
\sin\theta&\cos\theta
\end{bmatrix}
$$

$$
S(s_x,s_y)=
\begin{bmatrix}
s_x&0\\0&s_y
\end{bmatrix}
$$

> [!note] 直觉理解
> 矩阵的列向量可理解为坐标轴变换后的新位置。把一个点乘上矩阵，就是把它在旧坐标轴下的位置搬到新坐标轴体系中。

### 定义 5（齐次坐标）

齐次坐标把二维点扩展为三维形式，使平移也能用矩阵乘法表达：

$$
\text{point}=\begin{bmatrix}x\\y\\1\end{bmatrix}, \qquad
\text{vector}=\begin{bmatrix}x\\y\\0\end{bmatrix}
$$

二维仿射变换矩阵为：

$$
\begin{bmatrix}
x'\\y'\\1
\end{bmatrix}
=
\begin{bmatrix}
a&b&t_x\\
c&d&t_y\\
0&0&1
\end{bmatrix}
\begin{bmatrix}
x\\y\\1
\end{bmatrix}
$$

GAMES101 齐次坐标与仿射变换.relationship

> [!note] 直觉理解
> $w=1$ 的对象是点，会被平移影响；$w=0$ 的对象是向量，只表达方向和差值，因此不应被平移影响。

## 定理与命题

### 命题 1（点乘给出投影长度）

**陈述**：向量 $\mathbf{a}$ 在单位方向 $\hat{\mathbf{b}}$ 上的有符号投影长度为：

$$
\mathbf{a}\cdot\hat{\mathbf{b}}
$$

若 $\mathbf{b}$ 不是单位向量，投影向量为：

$$
\operatorname{proj}_{\mathbf{b}}\mathbf{a}
=\frac{\mathbf{a}\cdot\mathbf{b}}{\mathbf{b}\cdot\mathbf{b}}\mathbf{b}
$$

**证明思路**：由点乘定义 $\mathbf{a}\cdot\mathbf{b}=\|\mathbf{a}\|\|\mathbf{b}\|\cos\theta$，除以 $\|\mathbf{b}\|$ 得到 $\mathbf{a}$ 在 $\mathbf{b}$ 方向上的长度分量。

### 命题 2（叉乘给出法线方向）

**陈述**：若 $\mathbf{a}$ 与 $\mathbf{b}$ 不共线，则 $\mathbf{a}\times\mathbf{b}$ 垂直于 $\mathbf{a}$ 和 $\mathbf{b}$ 所在平面。

**验证**：

$$
(\mathbf{a}\times\mathbf{b})\cdot\mathbf{a}=0, \qquad
(\mathbf{a}\times\mathbf{b})\cdot\mathbf{b}=0
$$

**应用**：三角形 $ABC$ 的一条法线可写为：

$$
\mathbf{n}=(\mathbf{B}-\mathbf{A})\times(\mathbf{C}-\mathbf{A})
$$

法线方向取决于顶点顺序。

## 技术工具/引理

### 工具 1：判断三角形内外

给定三角形 $ABC$ 和点 $P$，可用边向量与到点向量的叉乘符号判断 $P$ 是否在同侧：

$$
(\mathbf{B}-\mathbf{A})\times(\mathbf{P}-\mathbf{A}),\quad
(\mathbf{C}-\mathbf{B})\times(\mathbf{P}-\mathbf{B}),\quad
(\mathbf{A}-\mathbf{C})\times(\mathbf{P}-\mathbf{C})
$$

若三个符号方向一致，则 $P$ 在三角形内部或边界上。

### 工具 2：二维变换速查

| 变换 | 齐次矩阵 |
|---|---|
| 平移 | $\begin{bmatrix}1&0&t_x\\0&1&t_y\\0&0&1\end{bmatrix}$ |
| 旋转 | $\begin{bmatrix}\cos\theta&-\sin\theta&0\\\sin\theta&\cos\theta&0\\0&0&1\end{bmatrix}$ |
| 缩放 | $\begin{bmatrix}s_x&0&0\\0&s_y&0\\0&0&1\end{bmatrix}$ |
| 剪切 | $\begin{bmatrix}1&k&0\\0&1&0\\0&0&1\end{bmatrix}$ |

## 结论

- 点乘处理夹角、投影、正交判断，是“方向一致程度”的工具。
- 叉乘处理面积、法线、朝向判断，是“平面方向关系”的工具。
- 矩阵把几何变换转成代数运算，组合时必须注意乘法顺序。
- 齐次坐标把平移、旋转、缩放、剪切统一进矩阵框架，并通过 $w$ 区分点与向量。
