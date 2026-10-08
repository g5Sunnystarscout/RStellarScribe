---
id: gfx-interface
category: media
title: GFX Sprite Definitions and Interface Graphics
title_zh: GFX 精灵定义与界面图形
file_types: [interface/*.gfx, gfx/**/*.dds, gfx/models/*.asset]
tags: [spriteType, texturefile, spriteTypes, text_icons, bitmapfont, noOfFrames]
related: [gui-files, flags-icons-ports, common-errors]
sources: [https://stellaris.paradoxwikis.com/Interface_modding, https://stellaris.paradoxwikis.com/Icon_modding, https://stellaris.paradoxwikis.com/Event_pictures, https://stellaris.paradoxwikis.com/Font_modding, https://stellaris.paradoxwikis.com/Localisation_modding]
verified_version: "3.14 / 4.x 页面（Interface 页较旧，媒体尺寸为页面明示值）"
---

## 概要

`interface/*.gfx` 是「图形文件 → 游戏内精灵名」的注册表。`.gui` 只写精灵名（`spriteType = "GFX_..."`），真正把名字绑到磁盘上的 `.dds` 靠 `.gfx`。`interface/` 目录使用 LIOS（后加载者生效）方式加载，因此**新增内容应放进自己的新文件**，不要改 vanilla 文件，否则和其他模组冲突。`.gfx` 必须是 UTF-8 **无 BOM**——BOM 会导致整个文件不解析（这是与 localisation 相反的唯一例外）。

## 文件位置与命名

| 用途 | 定义位置 | 贴图位置 |
| --- | --- | --- |
| 通用精灵 / 事件图片 / 文字图标 | `<mod>/interface/<任意名>.gfx` | 自定义路径 |
| 事件图片 | `interface/eventpictures.gfx`（vanilla）或自建 | `gfx/event_pictures/` |
| 自动图标（科技、建筑等） | **不需要** `.gfx` | `gfx/interface/icons/<类别>/` |
| 文字图标 | `<mod>/interface/*.gfx` | `gfx/interface/icons/text_icons/` |
| 字体位图 | `<mod>/interface/*.gfx` | `gfx/fonts/` |
| 模型 / 实体 | `.asset` 文件 | `gfx/models/`（含 `gfx/models/portraits/`） |

自动生成精灵的目录（无需 `spriteType` 定义）：`buildings`、`technologies`、`governments/civics`、`governments/authorities`、`governments`、`ethics`、`ascension_perks`、`tile_backgrounds`、`tile_blockers`、`decisions`、`gfx/portraits/environments`。命名规则是「实体 key 名 = dds 文件名」，例如科技 `tech_fractal_jazz` 自动找 `gfx/interface/icons/technologies/tech_fractal_jazz.dds`。若放进子文件夹，必须显式写 `icon = 子文件夹/文件名`（不带扩展名）。

## 语法与字段

```pdx
# <mod>/interface/my_mod_icons.gfx  —— 必须存为 UTF-8 (无 BOM)
spriteTypes = {
	spriteType = {
		name = "GFX_my_mod_event_picture"
		texturefile = "gfx/event_pictures/my_mod_event.dds"
		masking_texture = "gfx/interface/situation_log/event_mask.dds"
		alwaystransparent = yes
	}
	spriteType = {
		name = "GFX_my_mod_component_slots"
		texturefile = "gfx/interface/ship_designer/my_mod_slots.dds"
		noOfFrames = 5
	}
	corneredTileSpriteType = {
		name = "GFX_my_mod_panel"
		texturefile = "gfx/interface/my_mod_panel.dds"
		borderSize = { x = 80 y = 80 }
	}
	# 自定义文字图标：名字必须是 GFX_text_<key>，loc 里用 £key£ 引用
	spriteType = {
		name = "GFX_text_my_mod_insight"
		texturefile = "gfx/interface/icons/text_icons/my_mod_insight.dds"
	}
}

# 字体位图定义（同样放在 interface/*.gfx 中）
bitmapfonts = {
	bitmapfont = {
		name = "my_mod_font"
		fontfiles = {
			"gfx/fonts/my_mod_font_1"
			"gfx/fonts/my_mod_font_2"
		}
		color = 0xffffffff
		textcolors = { G = { 86 172 91 } }
	}
	# 按语言覆盖：l_english / l_russian / l_simp_chinese 等
	bitmapfont_override = {
		name = "my_mod_font"
		path = "gfx/fonts/my_mod_font_cjk"
		languages = { "l_simp_chinese" }
	}
}
```

`spriteType` / `corneredTileSpriteType` 可用属性：`name`（必需，全局唯一）、`textureFile`（必需，路径相对游戏安装目录）、`alwaystransparent`、`borderSize`（仅 cornered）、`effectFile`、`masking_texture`、`noOfFrames`。名字建议加模组缩写前缀：`GFX_<模组缩写>_<语义名>`。

关键尺寸与格式（页面明示值）：

- 事件图片：`.dds`，**450×150 像素（3:1）**，32bpp RGBA；起源缩略图为 **220×115**。
- 文字图标：标准为 **16×16** 的 `.dds`，放在 `gfx/interface/icons/text_icons/`。
- 图标建议 `A8R8G8B8`；带透明度用 ABGR8。`noOfFrames` 用于把一张图当精灵表切帧（如 `component_slot_size_weapon_icons.dds` 配 `noOfFrames = 5`）。
- 字体位图：单张图**不能超过 16 MB**（Paradox 中文位图最大用到约 16,001 KB）；超出需用多个 `fontfiles` 拆分。
- `.asset`/`.mesh`：`pdxmesh = { name = ... file = "gfx/models/..." animation = { id = ... type = ... } scale = ... }`，实体写 `entity = { name = ... pdxmesh = ... default_state = ... state = { ... } }`。

## 校验要点

1. `.gfx` 用 UTF-8 **无 BOM** 保存；`.yml` 才是 UTF-8 with BOM。
2. `name` 全局唯一；重复定义会导致精灵被覆盖或冲突。
3. `texturefile` 路径大小写必须与磁盘一致（Mac/Linux 大小写敏感）。
4. 被 `.gui`/loc 引用的名字必须真实存在：改名前先全局搜索 `GFX_` 引用。
5. 改了贴图**分辨率**必须重启游戏；`reload texture all` 只重载内容。
6. 自定义文字图标务必是 `GFX_text_` 前缀，loc 引用时**去掉前缀**。

## 常见错误

- 用 `types` 而不是 `spriteTypes` 作外层块 → 整个文件被忽略。
- 属性名写成 `textureFile`/`texturefile` 混用——两种情况游戏都接受，但同一文件内不一致易误读。
- 把 `.gfx` 存成 UTF-8-BOM → 精灵全部丢失，UI 出现空白/紫块。
- 忘记 `masking_texture`，事件图片不是圆角遮罩而显示为直角矩形。
- 文字图标写了 `name = "GFX_my_icon"`（缺 `text_`）→ loc 中 `£my_icon£` 无法解析。

## 待确认

- `alwaystransparent` 与 `.gui` 中的 `alwaysTransparent` 大小写不同，官方页面分别如此书写；是否引擎大小写不敏感未验证。
- `.dds` 的 mipmap 要求官方页面明确留白（"someone please fill this in"），未确认引擎是否强制要求 mipmap。
- `interface/` 的 LIOS 顺序与 `replace_path` 对 `.gfx` 的具体作用未在官方页面确认。

## 参考

- [Interface modding](https://stellaris.paradoxwikis.com/Interface_modding)
- [Icon modding](https://stellaris.paradoxwikis.com/Icon_modding)
- [Event pictures](https://stellaris.paradoxwikis.com/Event_pictures)
- [Font modding](https://stellaris.paradoxwikis.com/Font_modding)
- [Localisation modding（£ Codes / £ Custom Icons / Color Codes）](https://stellaris.paradoxwikis.com/Localisation_modding)
