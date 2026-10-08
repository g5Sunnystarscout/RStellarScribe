---
id: flags-icons-ports
category: media
title: Flags, Icons, Portraits, Music and Sound
title_zh: 旗帜、图标、肖像、音乐与音效
file_types: [flags/**/*.dds, gfx/interface/icons/**/*.dds, gfx/portraits/**/*.txt, music/*.asset, sound/*.asset]
tags: [empire_flag, FLAG_CATEGORY, usage.txt, portraits, songlist, character_textures]
related: [gfx-interface, common-errors, debugging-logs]
sources: [https://stellaris.paradoxwikis.com/Flag_modding, https://stellaris.paradoxwikis.com/Icon_modding, https://stellaris.paradoxwikis.com/Portrait_modding, https://stellaris.paradoxwikis.com/Music_modding, https://stellaris.paradoxwikis.com/Modding]
verified_version: "Flag 页 4.2.4；Portrait 页 3.3；Music 页 timeless"
---

## 概要

这一组资源有几个**不在 `common/` 下**、容易被想当然放错的位置，需要特别注意：

- 帝国旗帜徽记在 `<mod>/flags/`（**不是** `map/flag`），且必须配 `usage.txt` 和本地化分类名；
- 肖像（portrait）定义在 `<mod>/gfx/portraits/portraits/*.txt`（**不是** `common/portraits`），但**物种分类**在 `<mod>/common/species_classes/`；
- 音乐在 `<mod>/music/`（`.ogg` + `.asset` + `.txt`），音效在 `<mod>/sound/`（`.asset` + `.wav`），**都没有** `common/music` 这个目录。

## 文件位置与命名

```
<mod>/
├── flags/
│   └── my_flags/                 # 分类文件夹名 = FLAG_CATEGORY_<此名>
│       ├── emblem.dds            # 128x128  默认/中等
│       ├── usage.txt
│       ├── map/emblem.dds        # 256x256  银河地图用（通常纯白）
│       └── small/emblem.dds      # 24x24    单位旁显示
├── gfx/
│   ├── interface/icons/          # 自动图标：buildings / technologies / ethics / ...
│   ├── interface/icons/text_icons/   # 16x16 文字图标
│   ├── portraits/portraits/*.txt     # 肖像与 portrait_groups 定义
│   ├── portraits/asset_selectors/    # clothes / hair 选择器
│   └── models/portraits/             # .mesh / .asset / 角色贴图 .dds
├── common/species_classes/       # 把肖像名登记到物种类（HUM/FUN/...）
├── sound/                        # *.asset + *.wav
└── music/                        # *.ogg + *.asset + *.txt
```

## 语法与字段

**旗帜徽记。** 三个 `.dds` 必须**同名**（如 `emblem.dds`），且必须位于 `<mod>/flags/` 的某个子文件夹内。徽记是正方形、建议透明背景。游戏会对图像重新着色，银河地图上颜色可能失真。压缩：DXT1/DXT5 可能产生瑕疵，出现瑕疵就用未压缩的 ARGB 8888。

`<mod>/flags/my_flags/usage.txt`：

```pdx
random = no
show_in_designer = yes
```

本地化（`localisation/my_mod_l_english.yml`，**UTF-8 with BOM**），`FLAG_CATEGORY` 后的名字必须等于 `flags/` 下新建的文件夹名：

```pdx
l_english:
 FLAG_CATEGORY_my_flags:0 "My Flags"
```

脚本里引用旗帜（预设国家等）：

```pdx
empire_flag = {
	icon = {
		category = "my_flags"
		file = "emblem.dds"
	}
	background = {
		category = "backgrounds"
		file = "pattern_01.dds"
	}
	colors = {
		"turquoise"
		"indigo"
		"null"
		"null"
	}
}
```

颜色名清单在 vanilla 的 `flags/colors.txt`。

**图标。** 见 gfx-interface 的自动目录表：`icon =` 通常**不需要**写，游戏按实体 key 自动找同名 `.dds`。放进子文件夹后才需要 `icon = 子文件夹/文件名`（不带 `.dds`）。文字图标 16×16，定义 `name = "GFX_text_<key>"`，loc 中写 `£<key>£`。

**肖像。** 静态肖像最简形式（写在 `<mod>/gfx/portraits/portraits/00_portraits.txt` 之类的文件里）：

```pdx
portraits = {
	my_alien_1 = {
		spriteType = "GFX_portrait_my_alien_1"
	}
	# 或直接给贴图
	my_alien_2 = {
		texturefile = "gfx/interface/portraits/my_alien_2.dds"
	}
}
```

动画面具肖像的字段（写在 `gfx/portraits/portraits/[##]_portraits_[phenotype].txt`）：

```pdx
myalien14 = {
	entity = "portrait_myalien_14_entity"
	clothes_selector = "myalien_massive_clothes_01"
	hair_selector = "no_texture"
	greeting_sound = "myalien_01_greetings"
	character_textures = {
		"gfx/models/portraits/myalien/myalien_massive_14_1.dds"
		"gfx/models/portraits/myalien/myalien_massive_14_2.dds"
	}
}
```

`entity` 定义在 `gfx/models/portraits/*_portraits.asset`，`clothes_selector`/`hair_selector` 定义在 `gfx/portraits/asset_selectors/`，都不需要时写 `no_texture`。`.gfx` 中还要写 `objectTypes = { pdxmesh = { name = ... file = "gfx/models/portraits/.../x.mesh" animation = { id = "idle" type = "<.asset 里的 animation 名>" } scale = 1.0 } }`，`.asset` 里配 `animation = { name = ... file = ... }` 与 `entity = { name = ... pdxmesh = ... default_state = "idle" state = { name = "idle" animation = ... chance = 2.0 looping = no next_state = idle } scale = 1.12 }`。多个同名 `state` 用 `chance` 做加权随机。

**肖像组（portrait_groups）。** 6 个键：`default`、`game_setup`、`species`、`pop`、`leader`、`ruler`。后四者可用 `add = { trigger = { ... } portraits = { ... } }` 做条件替换。`species` 作用域下写多个肖像只有第一个生效；`pop` 作用域才是随机候选。

**登记到物种类。** 未在 `common/species_classes/00_species_classes.txt` / `01_base_species_classes.txt` 登记的肖像组**不会出现在游戏中**，也不会获得问候/侮辱语。例如把 `myalien14` 加进 `MAM = { portraits = { ... } }`。另外 `common/scripted_triggers/00_scripted_triggers.txt` 里的 `wears_clothes`、`lithoids_portrait`、`necroids_portrait` 会影响相关判定。

**音乐。** 把 `.ogg`（Ogg Vorbis，**44.1 kHz**）放进 `<mod>/music/`。**不要**把自己的文件命名为 `songs.asset` / `songs.txt`，否则会覆盖 vanilla 的曲目表；用唯一的模组名前缀。

```pdx
# <mod>/music/my_musicpack.asset
music = {
	name = "My Track Title"
	file = "my_track.ogg"
	volume = 0.50
}
```

```pdx
# <mod>/music/my_musicpack.txt
song = {
	name = "My Track Title"
}
```

`name` 是音乐播放器里显示的名字（若音频元数据里有标题，元数据优先；两首歌元数据同名时只有第一首会出现）。多个音乐包可共存、互不覆盖。改主菜单主题：歌曲名**必须**写成 `mainthemeX`（X = 1..35），游戏启动时播放找到的最大编号；若要替换且在播放器里不重复出现，还要把对应旧编号的 `.txt`/`.asset` 建成空文件。

**音效。** `<mod>/sound/` 下放 `.asset`（定义音效）与 `.wav`（音频）；子目录按用途划分（如 `sound/category.asset` 可把 `greeting_sound` 写成集合）。

## 校验要点

1. 三个旗帜贴图**同名**、尺寸分别为 128 / 256 / 24，位置分别为 `flags/<cat>/`、`.../map/`、`.../small/`。
2. `flags/<cat>/usage.txt` 存在，否则 AI 会拿它生成旗帜。
3. `FLAG_CATEGORY_<cat>` 本地化存在，否则分类名显示为 key。
4. 本地化必须是 UTF-8 **with BOM**；`.gfx` / `.asset` 是 UTF-8 **无 BOM**。
5. 肖像必须同时：在 `gfx/portraits/portraits/*.txt` 定义、`entity` 在 `.asset` 存在、名字登记进 `common/species_classes`。
6. 音乐文件用 `.ogg` 44.1 kHz；`.asset`/`.txt` 用唯一文件名。
7. 路径与文件名大小写：Mac/Linux 敏感。
8. 替换 vanilla 资源时用**相同目录路径 + 相同文件名**，扩展名不能换来换去（`.dds` 就是 `.dds`）。

## 常见错误

- 把旗帜放在 `map/flag/` 或 `gfx/flags/` → 完全不生效；正确位置是模组根的 `flags/`。
- 只放 128×128 那张、缺 `map/` 与 `small/` → 银河地图或单位旗帜空白。
- 忘了 `usage.txt` → AI 帝国随机使用你的徽记。
- 忘了 `FLAG_CATEGORY_*` 本地化 → 帝国创建界面出现原始 key。
- 肖像定义了但没登记进 `common/species_classes` → 游戏里根本看不到，也不会有问候/侮辱语。
- 音乐文件命名为 `songs.asset` / `songs.txt` → 覆盖 vanilla 曲目表。
- `.ogg` 采样率不是 44.1 kHz 或用了 `.mp3` → 不播放或报错。
- 修改贴图分辨率后只 `reload texture all` → 必须重启游戏。

## 待确认

- 旗帜贴图的 mipmap 要求与 DXT 压缩取舍，官方页面只给"有瑕疵就用未压缩"，未给统一结论。
- `usage.txt` 的完整可选项（除 `random`、`show_in_designer` 外）未在页面列出。
- `sound/*.asset` 的完整字段表：官方没有独立的 Sound modding 页面（Modding 页标注该指南"page does not exist"），字段名未逐一核实。
- 非拉丁字母语言（simplified Chinese / japanese / korean）的字体位图拆分实践见 Font_modding，但 `bitmapfont_override` 的 `languages` 取值与 `localisation/` 子目录是否严格一一对应未验证。

## 参考

- [Flag modding](https://stellaris.paradoxwikis.com/Flag_modding)
- [Icon modding](https://stellaris.paradoxwikis.com/Icon_modding)
- [Portrait modding](https://stellaris.paradoxwikis.com/Portrait_modding)
- [Music modding](https://stellaris.paradoxwikis.com/Music_modding)
- [Modding（Game structure 目录表）](https://stellaris.paradoxwikis.com/Modding)
