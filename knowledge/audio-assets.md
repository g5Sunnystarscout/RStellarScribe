---
id: audio-assets
category: media
title: Registering Audio Assets - Sounds and Music
title_zh: 音频素材注册：音效与音乐
file_types: [sound/**/*.asset, music/**/*.asset, music/*.txt, sound/**/*.wav, music/**/*.ogg, localisation/*/musicplayer_l_*.yml]
tags: [sound, soundeffect, category, falloff, soundgroup, music, song, wav, ogg, vorbis, 44.1kHz, sample rate, asset registration]
related: [image-assets, gfx-interface, localisation-basics, debugging-logs]
sources: [https://stellaris.paradoxwikis.com/Sound_modding, https://stellaris.paradoxwikis.com/Music_modding]
verified_version: "4.4.6 Pegasus（本机 <Stellaris>：sound/ 114 个 .asset + 6890 个 .wav，music/ 7 个 .asset + 7 个 .txt + 30 个 .ogg，逐个读头）"
---

## 概要

音频分两套互不通用的注册表：**`sound/` 收 `.wav`，`music/` 收 `.ogg`**。本机实测：`sound/**` 下 6890 个 `.wav`、0 个 `.ogg`（另有 114 个 `.asset`）；`music/**` 下 30 个 `.ogg`、0 个 `.wav`（另有 7 个 `.asset`、7 个 `.txt`）。`soundtrack/` 里的 23 个 `.flac` 与 23 个 `.mp3` 是**随游戏发行的原声碟**，没有任何 `.asset` 引用它们，引擎不加载——不要照它推断引擎支持 mp3/flac。

**`file` 字段相对 `.asset` 文件自己的目录解析**，这是最容易搞错的一条。对安装里全部 5931 个带 `file` 的 `sound`/`music` 块做了双向测试：

- 4569 个**只**能按「`.asset` 所在目录 + `file`」解析成功；
- 0 个只能按 `<sound/|music/> + file` 解析成功；
- 1362 个两种都成立（`.asset` 就在 `sound/`、`music/` 根下，两种解释重合）；
- 0 个两种都不成立。

例：`sound/ambient/System VFX/system_vfx.asset:31` 的 `file = "sfx_amb_crisis_contingency_01.wav"` → `sound/ambient/System VFX/sfx_amb_crisis_contingency_01.wav` 存在，而 `sound/sfx_amb_crisis_contingency_01.wav` 不存在。所以把 `.asset` 和音频放同一个目录最省事。

## 文件位置与命名

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 单个音频文件注册 | `sound/**/*.asset` 里的 `sound = { }` | `file` 相对该 `.asset` 的目录 |
| 可播放的音效组 | `sound/**/*.asset` 里的 `soundeffect = { }` | `.gui` 的 `clicksound =` 只能用这个名字 |
| 混音分组 | `sound/**/*.asset` 里的 `category = { }` | 安装里只有 6 个名字，见下 |
| 距离衰减 | `sound/falloff.asset` 的 `falloff = { }` | 31 个，`falloff_50` … |
| 语音覆盖组 | `sound/soundgroups.asset`、`sound/humanoid_soundgroups.asset` | `soundgroup = { }`，16 个名字 |
| 顾问语音类型 | `sound/advisor_voice_types/*.txt` | 与 `soundgroup` 同名，决定设置界面的可选语音 |
| 音乐曲目 | `music/**/*.asset` 里的 `music = { }` | 30 条，文件都在 `music/` 根下 |
| 音乐播放器条目 | `music/*.txt` 里的 `song = { }` | 30 条，**没有它曲目不出现在音乐播放器** |
| 曲目显示名 | `localisation/<语言>/musicplayer_l_<语言>.yml` | 键就是 `music` 的 `name` 值 |

6 个混音分组名（`category`）：`Ambient`、`Effects`、`Weapon`、`Menu`、`Ships`、`Voice`。**没有任何 `.gui` 引用这些名字**（177 个 `.gui` 文件全查过），所以音量滑条是引擎硬编码的，模组加不了第 7 个。同一个分组名在多个文件里重复声明：`Effects` 同时在 `sound/category.asset:143` 与 `sound/ancient_relics/ancient_relics.asset:1`，`Weapon` 在 `sound/category.asset:3` 与 `sound/apocalypse/apocalypse.asset:62`。这**说明**引擎是把 `soundeffects` 列表**并集**起来而不是整块替换（否则 DLC 音效早就听不见了），但未做实测验证。

## 语法与字段

```pdx
# <mod>/sound/<前缀>/<前缀>_sound.asset —— UTF-8 无 BOM（.asset 是脚本，不是本地化）
sound = {
	name = my_mod_click          # 脚本里 sound = my_mod_click 引用
	file = "my_mod_click.wav"    # 相对本文件所在目录 → sound/<前缀>/my_mod_click.wav
	volume = 0.5
	always_load = no
}

soundeffect = {                # 可播放的组；.gui 的 clicksound 只能用这个名字
	name = my_mod_click_sfx
	sounds = {
		sound = my_mod_click
	}
	volume = 0.5
	max_audible = 1
	max_audible_behaviour = fail
}

category = {                   # 加入某个混音分组（滑条音量受其控制）
	name = Effects
	soundeffects = {
		my_mod_click_sfx
	}
}
```

```pdx
# <mod>/music/<前缀>_music.asset
music = {
	name = my_mod_theme
	file = "my_mod_theme.ogg"
	volume = 0.8
}

# <mod>/music/<前缀>_songs.txt —— 让它出现在音乐播放器里
song = {
	name = my_mod_theme
}

# <mod>/localisation/<语言>/<前缀>_musicplayer_l_<语言>.yml（UTF-8 with BOM）
l_english:
 my_mod_theme:0 "My Theme"
```

`sound` 块实测字段（5901 条）：`name`、`file` 必需；`volume` 4254、`always_load` 415、`priority` 28。`soundeffect` 块（2897 条）：`sounds`、`name` 必需；`volume` 2727、`max_audible` 2519、`max_audible_behaviour` 2331、`is3d` 1654、`loop` 1306、`falloff` 1156、`fade_out` 987、`fade_in` 531，以及 `playbackrate_random_offset`（块）302、`volume_random_offset` 214、`delay_random_offset` 124 三组随机化块。`music` 块（30 条）：`name`、`file` 必需，`volume` 21。`falloff`（31 条）：`name`、`min_distance`、`max_distance` 必需，`type` 16、`height_scale` 5。

音频文件实测（逐个读头）：

- `sound/**/*.wav` 6890 个：**6890 个全是 44100 Hz**；16 bit 6804、24 bit 86；双声道 4760、单声道 2130；格式标签全部是 `0x0001`（未压缩 PCM）。
- `music/**/*.ogg` 30 个：**30 个全是 44100 Hz、2 声道 Vorbis**（stream version 0，blocksize 184/1）。

采样率是**硬要求**，引擎自己会说：`logs/error.log` 里逐曲打印
`[pdx_audiomusic_sdl.cpp:88]: For best performance and quality music files should be in 44.1kHz (<曲名>)`。
本机日志第 574–585 行的这 12 条正是某个中文模组的 48 kHz 曲目（名字是中文），而 vanilla 的 30 首全部 44.1 kHz，所以这条规则是可检查的事实，不是建议。

## 校验要点

1. `sound/` 只收 `.wav`，`music/` 只收 `.ogg`：本机 `sound/**` 下 0 个 `.ogg`、`music/**` 下 0 个 `.wav`。容器放错注册表等于没注册。
2. **采样率必须 44100 Hz**：30/30 首音乐与 6890/6890 个音效都是 44100；否则引擎在 `error.log` 里逐条写 `pdx_audiomusic_sdl.cpp:88` 那行警告。
3. WAV 用未压缩 PCM（格式标签 `0x1`）：6890/6890。压缩 WAV（ADPCM、MP3-in-WAV）在本安装无先例。
4. `file` **相对 `.asset` 自己的目录**（4569/5931 只能这样解析；反向 0/5931）。把 `.asset` 与音频放同一目录最不容易错。
5. 音乐要**两个文件**才「存在」：`music/*.asset` 的 `music` 块让引擎能加载，`music/*.txt` 的 `song` 块才让曲目出现在音乐播放器里（30 条 music、30 条 song，一一对应，无孤儿）。
6. `song` 的 `name` 与 `music` 的 `name` 必须一致；曲目显示名是**以该 name 为键的本地化**（`maintheme:0 "Creation and Beyond"`）。没写本地化就显示原始键（vanilla 也有漏的：`maintheme3`、`towardsutopianovaflare` 在英文 loc 里没有条目）。
7. 曲名本地化文件必须 **UTF-8 with BOM**，文件名带 `_l_<语言>`，首行 `l_<语言>:`，每个条目行以空白开头。
8. `sound`/`soundeffect`/`music`/`song` 的 `name` 是**裸标识符**：全部匹配 `[A-Za-z0-9_]`（5901 + 2897 + 30 + 30 条），脚本里不加引号引用。
9. 模组只能加入 6 个既有混音分组之一，不能新建（177 个 `.gui` 里没有任何分组名，滑条是硬编码的）。
10. `sound/advisor_voice_types/*.txt` 里的名字必须与 `soundgroup` 同名；顾问语音是另一套注册表，不走 `category`。

## 常见错误

- 把 `.ogg` 放进 `sound/`（或 `.wav` 放进 `music/`）：不报错、不播放。
- 48 kHz 音乐：能播，但 `error.log` 每次加载都写一遍 `pdx_audiomusic_sdl.cpp:88`，且官方提示音质/性能受影响。
- 只写了 `music` 没写 `song`：曲目永远不会出现在音乐播放器列表里。
- `file` 按 `sound/` 根写而 `.asset` 放在子目录：路径解析不到，静默无声（这条 4569/5931 的实测就是为此）。
- 以为能给混音器加新分组：`category` 只有 6 个合法名字，引擎没有第 7 条滑条。
- 把 `soundtrack/*.mp3`/`.flac` 当成「引擎支持 mp3/flac」的证据：那一目录是发行原声，不参与加载。

## 待确认

- 同名 `category` 块在多文件里是**并集**还是**整块替换**：本机结构强烈指向并集（DLC 与基础游戏各写一份 `Effects`），但未做实测。若为替换，模组后加载时会顶掉 vanilla 该分组的整个列表。
- `soundeffect` 的 `max_audible_behaviour` 除 `fail` 外是否有其他取值：本机 2331 条全部是 `fail`，未穷举。
- `is3d` + `falloff` 的可听范围与 3D 定位未实机验证；本工具只写入你给的字段名。
- 44.1 kHz 之外的采样率对**音效**（非音乐）是否同样有影响：日志行来自 `pdx_audiomusic_sdl.cpp`（音乐子系统），而 6890 个音效恰好也全是 44.1 kHz，无法区分「要求」与「惯例」。

## 参考

- [Sound modding](https://stellaris.paradoxwikis.com/Sound_modding)
- [Music modding](https://stellaris.paradoxwikis.com/Music_modding)
