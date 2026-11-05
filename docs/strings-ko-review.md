# Korean UI strings for review

Generated from `src/i18n/en.ts` and `src/i18n/ko.ts` by `node scripts/strings-review.mjs`. Edit the wording in
`src/i18n/ko.ts`, then run the script again. Terms follow `docs/glossary.md`. Units, numbers, KST times and
citations are deliberately not translated; exports (CSV/JSON, bundle README) stay in English.

Entries marked ƒ are templates: `${…}` is filled in by the app (a number, time, date or name).

## Shared

| Key | English | 한국어 |
|---|---|---|
| `common.cloudNone` | no forecast | 예보 없음 |
| `common.cloud` | ƒ(t, l, m, h) → `${t}% total · low ${l} / mid ${m} / high ${h}` | ƒ(t, l, m, h) → `전체 ${t}% · 하층 ${l} / 중층 ${m} / 상층 ${h}` |
| `common.attribution` | Weather data by Open-Meteo.com | 날씨 데이터: Open-Meteo.com |
| `common.compass.N` | N | 북 |
| `common.compass.NNE` | NNE | 북북동 |
| `common.compass.NE` | NE | 북동 |
| `common.compass.ENE` | ENE | 동북동 |
| `common.compass.E` | E | 동 |
| `common.compass.ESE` | ESE | 동남동 |
| `common.compass.SE` | SE | 남동 |
| `common.compass.SSE` | SSE | 남남동 |
| `common.compass.S` | S | 남 |
| `common.compass.SSW` | SSW | 남남서 |
| `common.compass.SW` | SW | 남서 |
| `common.compass.WSW` | WSW | 서남서 |
| `common.compass.W` | W | 서 |
| `common.compass.WNW` | WNW | 서북서 |
| `common.compass.NW` | NW | 북서 |
| `common.compass.NNW` | NNW | 북북서 |
| `common.band.twilight` | Twilight band | 박명 구간 |
| `common.band.dark` | Dark band | 어두운 구간 |

## Top bar, tabs, date and site

| Key | English | 한국어 |
|---|---|---|
| `shell.night` | Night | 야간 |
| `shell.nightOn` | Night on | 야간 켬 |
| `shell.autoNight` | ƒ(alt) → `Auto night: Sun below ${alt}°` | ƒ(alt) → `자동 야간 모드: 태양 ${alt}° 아래` |
| `shell.dayMode` | Switch to day mode | 주간 모드로 바꾸기 |
| `shell.tabs.night` | Night | 계획 |
| `shell.tabs.outlook` | 14 nights | 14일 |
| `shell.tabs.sats` | Satellites | 위성 |
| `shell.tabs.log` | Log | 기록 |
| `shell.prevNight` | Previous night | 전날 밤 |
| `shell.nextNight` | Next night | 다음 날 밤 |
| `shell.dateSub` | evening, KST | 저녁, KST |
| `shell.tapHint` |  · tap to pick |  · 눌러서 날짜 고르기 |
| `shell.dateAria` | Observation date (evening, KST) | 관측 날짜 (저녁, KST) |
| `shell.tonight` | Tonight | 오늘 밤 |
| `shell.site` | Site: | 장소: |
| `shell.siteName` | Name | 이름 |
| `shell.lat` | Latitude (°N) | 위도 (°N) |
| `shell.lon` | Longitude (°E) | 경도 (°E) |
| `shell.elev` | Elevation (m) | 해발 (m) |
| `shell.saveSite` | Save site | 장소 저장 |
| `shell.gps` | Use GPS | GPS 사용 |
| `shell.reset` | Reset to default | 기본값으로 |
| `shell.saved` | Saved on this device. | 이 기기에 저장했어요. |
| `shell.resetTo` | ƒ(name) → `Reset to ${name}.` | ƒ(name) → `${name}(으)로 되돌렸어요.` |
| `shell.noGeo` | Geolocation is not available in this browser. | 이 브라우저에서는 위치를 쓸 수 없어요. |
| `shell.gettingLoc` | Getting location… | 위치 찾는 중… |
| `shell.gpsName` | GPS position | GPS 위치 |
| `shell.gpsFilled` | ƒ(m) → `Filled from GPS (±${m} m). Tap “Save site” to use it.` | ƒ(m) → `GPS로 채웠어요 (±${m} m). 쓰려면 “장소 저장”을 누르세요.` |
| `shell.gpsFailed` | ƒ(msg) → `Location failed: ${msg} (GPS needs HTTPS or localhost).` | ƒ(msg) → `위치를 찾지 못했어요: ${msg} (GPS는 HTTPS나 localhost에서만 돼요).` |
| `shell.customSite` | Custom site | 직접 입력한 장소 |
| `shell.siteErr.Latitude must be between −90 and 90.` | Latitude must be between −90 and 90. | 위도는 −90에서 90 사이여야 해요. |
| `shell.siteErr.Longitude must be between −180 and 180.` | Longitude must be between −180 and 180. | 경도는 −180에서 180 사이여야 해요. |
| `shell.siteErr.Elevation must be between −500 and 9000 m.` | Elevation must be between −500 and 9000 m. | 해발은 −500에서 9000 m 사이여야 해요. |
| `shell.footer` | All times KST (Asia/Seoul, UTC+9). Sun &amp; Moon: <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">astronomy-engine</a> 2.1.19. Weather: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0). | 모든 시각은 KST (Asia/Seoul, UTC+9). 태양·달: <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">astronomy-engine</a> 2.1.19. 날씨: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0). |
| `shell.langBtn` | 한국어 | EN |
| `shell.langAria` | Switch to Korean (한국어로 보기) | 영어로 보기 (Switch to English) |

## Night tab

| Key | English | 한국어 |
|---|---|---|
| `night.noWindowTitle` | Shooting window | 촬영 시간 |
| `night.noWindow` | No complete window this night (see the warning above). | 이 날 밤에는 촬영할 수 있는 시간이 없어요 (위 안내 참고). |
| `night.warnNoAlt` | ƒ(alt, dark) → `The Sun does not reach ${alt}° on this night at this site, so the ${dark ? "dark" : "twilight"} band cannot be observed.` | ƒ(alt, dark) → `이 장소에서는 이 날 밤 태양이 ${alt}°까지 내려가지 않아서 ${dark ? "어두운 구간" : "박명 구간"}을 찍을 수 없어요.` |
| `night.stripAria` | All frames of the night. Tap a frame for its time. | 이 밤의 모든 프레임. 프레임을 누르면 시각이 나와요. |
| `night.barAria` | ƒ(n) → `Whole night, frames 1 to ${n}. Tap to look at a frame.` | ƒ(n) → `밤 전체, 프레임 1–${n}. 누르면 그 프레임으로 가요.` |
| `night.edge.twilight` | TWILIGHT | 박명 |
| `night.edge.dark` | DARK | 어둠 |
| `night.edge.twilightShort` | TW | 박명 |
| `night.edge.darkShort` | DK | 어둠 |
| `night.frameAria` | ƒ(n, band) → `Frame ${n}${band ? `, ${band.toLowerCase()}` : ""}` | ƒ(n, band) → `프레임 ${n}${band ? `, ${band}` : ""}` |
| `night.frame` | ƒ(n) → `Frame ${n}` | ƒ(n) → `프레임 ${n}` |
| `night.noBand` | no band | 구간 밖 |
| `night.now` | Now | 지금 |
| `night.back` | Back | 돌아가기 |
| `night.leadDuring` | ƒ(n) → `Frame ${n} is being exposed` | ƒ(n) → `지금 프레임 ${n} 노출 중` |
| `night.leadAfter` | All frames shot | 모든 프레임 촬영 끝 |
| `night.leadBefore` | ƒ(t) → `Frame 1 starts at ${t}` | ƒ(t) → `프레임 1 시작 ${t}` |
| `night.tapHint` | tap a frame for its time | 프레임을 누르면 시각이 나와요 |
| `night.framesRange` | ƒ(a, b) → `frames ${a}–${b}` | ƒ(a, b) → `프레임 ${a}–${b}` |
| `night.beforeTwilight` | Before the twilight band | 박명 구간 전 |
| `night.between` | Between the bands | 구간 사이 |
| `night.afterDark` | After the dark band | 어두운 구간 뒤 |
| `night.frameNowOf` | ƒ(n) → `frame now, of ${n}` | ƒ(n) → `지금 프레임 · 전체 ${n}` |
| `night.framesPlanned` | frames planned | 계획한 프레임 |
| `night.done` | Shooting done | 촬영 끝 |
| `night.ended` | ƒ(t) → `ended ${t}` | ƒ(t) → `${t}에 끝남` |
| `night.startsIn` | ƒ(d) → `starts in ${d}` | ƒ(d) → `${d} 뒤 시작` |
| `night.durFrames` | ƒ(d, n) → `${d} · ${n} frames` | ƒ(d, n) → `${d} · ${n}프레임` |
| `night.startShooting` | start shooting | 촬영 시작 |
| `night.frame1At` | ƒ(t) → `frame 1 at ${t}` | ƒ(t) → `프레임 1: ${t}` |
| `night.next` | Next | 다음 |
| `night.inDur` | ƒ(d) → `in ${d}` | ƒ(d) → `${d} 남음` |
| `night.timelineTitle` | Field timeline | 현장 시간표 |
| `night.timelineAria` | Field timeline, KST | 현장 시간표, KST |
| `night.timelineNote` | The right column is the frame number if shooting starts exactly on time: for steps, the frame being exposed at that moment; for band rows, the band’s first or last frame. A frame belongs to a band if the Sun’s altitude at its mid-exposure (frame start + exposure/2) is inside the band. Use the time.is photos to correct for the camera clock. | 오른쪽 숫자는 정시에 촬영을 시작했을 때의 프레임 번호예요. 할 일 줄은 그 시각에 노출 중인 프레임, 구간 줄은 그 구간의 첫 프레임이나 마지막 프레임이에요. 노출 중간 시점(프레임 시작 + 노출/2)의 태양 고도가 구간 안에 있으면 그 프레임은 그 구간에 들어가요. 카메라 시계는 time.is 사진으로 보정하세요. |
| `night.steps.arrive` | Arrive and set up | 도착해서 장비 설치 |
| `night.steps.focus` | Focus on a bright star | 밝은 별로 초점 맞추기 |
| `night.steps.timeisBefore` | time.is photo (before) | time.is 화면 촬영 (시작 전) |
| `night.steps.start` | Start shooting | 촬영 시작 |
| `night.steps.end` | End shooting | 촬영 끝 |
| `night.steps.timeisAfter` | time.is photo (after) | time.is 화면 촬영 (끝난 뒤) |
| `night.steps.twilightStart` | Twilight band starts (−12°) | 박명 구간 시작 (−12°) |
| `night.steps.twilightEnd` | Twilight band ends (−20°) | 박명 구간 끝 (−20°) |
| `night.steps.darkStart` | Dark band starts (−25°) | 어두운 구간 시작 (−25°) |
| `night.steps.darkEnd` | Dark band ends (−35°) | 어두운 구간 끝 (−35°) |
| `night.windowTitle` | Shooting window | 촬영 시간 |
| `night.window` | Window | 촬영 시간 |
| `night.shots` | Number of Shots | 촬영 매수 |
| `night.expInt` | ƒ(e, i) → `${e} s exposure, ${i} s interval` | ƒ(e, i) → `노출 ${e} s, 간격 ${i} s` |
| `night.nFrames` | ƒ(n) → `${n} frames` | ƒ(n) → `${n}프레임` |
| `night.cloudLine` | Cloud forecast (window mean): | 구름 예보 (촬영 시간 평균): |
| `night.windowNote` | ƒ(m, a, b, i) → `Window = ${m} min before the Sun reaches ${a}° to ${m} min after it reaches ${b}°. Shots = ⌈duration ÷ ${i} s⌉. Band frames are for an on-time start.` | ƒ(m, a, b, i) → `촬영 시간 = 태양이 ${a}°에 닿기 ${m} min 전부터 ${b}°에 닿은 뒤 ${m} min까지. 촬영 매수 = ⌈길이 ÷ ${i} s⌉. 구간 프레임은 정시에 시작했을 때 기준이에요.` |
| `night.sunTitle` | Sun | 태양 |
| `night.sunset` | Sunset | 일몰 |
| `night.sunsetDetail` | (upper limb, refraction) | (윗가장자리, 대기차 포함) |
| `night.sunLabels.-6` | Civil twilight ends | 시민 박명 끝 |
| `night.sunLabels.-12` | Nautical twilight ends · twilight band starts | 항해 박명 끝 · 박명 구간 시작 |
| `night.sunLabels.-18` | Astronomical twilight ends | 천문 박명 끝 |
| `night.sunLabels.-20` | Twilight band ends | 박명 구간 끝 |
| `night.sunLabels.-25` | Dark band starts | 어두운 구간 시작 |
| `night.sunLabels.-35` | Dark band ends | 어두운 구간 끝 |
| `night.thEvent` | Event | 현상 |
| `night.thSunAlt` | Sun alt. | 태양 고도 |
| `night.sunNote` | Sunset: Sun’s upper limb at the horizon with standard refraction (−0.8° for the centre). Other rows: geometric altitude of the Sun’s centre, no refraction (standard twilight definition). Cross-check −6°, −12°, −18° and sunset against KASI (astro.kasi.re.kr) or timeanddate.com. | 일몰: 태양의 윗가장자리가 지평선에 닿는 때, 표준 대기차 포함 (중심 기준 −0.8°). 나머지 줄: 태양 중심의 기하학적 고도, 대기차 없음 (표준 박명 정의). −6°, −12°, −18°와 일몰은 KASI (astro.kasi.re.kr)나 timeanddate.com과 비교해 확인하세요. |
| `night.moonTitle` | Moon | 달 |
| `night.lit` | ƒ(p) → `${p}% lit` | ƒ(p) → `달 ${p}%` |
| `night.phaseAt` | ƒ(phase, t) → `${phase} · at ${t}` | ƒ(phase, t) → `${phase} · ${t} 기준` |
| `night.moonrise` | Moonrise | 월출 |
| `night.moonset` | Moonset | 월몰 |
| `night.upDuring` | Up during window | 촬영 중 떠 있는 시간 |
| `night.upOf` | ƒ(a, b) → `${a} of ${b} min` | ƒ(a, b) → `${b} min 중 ${a} min` |
| `night.maxAlt` | ƒ(d) → ` · max alt ${d}` | ƒ(d) → ` · 최고 고도 ${d}` |
| `night.thMoonAlt` | Moon alt. | 달 고도 |
| `night.thMoonAz` | Moon az. | 달 방위각 |
| `night.moonNote` | Rise/set: next events after 12:00 KST of the date (within 24 h; “(+1d)” = next day). Moon altitude is apparent (topocentric, with refraction); negative = below horizon. Azimuth from north through east. Rows in a solar band are marked. | 월출·월몰: 그날 12:00 KST 뒤 첫 시각 (24시간 안, “(+1d)” = 다음 날). 달 고도는 겉보기 고도예요 (관측자 기준, 대기차 포함). 음수면 지평선 아래예요. 방위각은 북쪽에서 동쪽으로 잰 값이에요. 태양이 구간 안에 있는 줄은 표시돼 있어요. |

## Log tab

| Key | English | 한국어 |
|---|---|---|
| `log.band.twilight` | Twilight band | 박명 구간 |
| `log.band.dark` | Dark band | 어두운 구간 |
| `log.band.gap` | Between bands | 구간 사이 |
| `log.band.outside` | Outside bands | 구간 밖 |
| `log.storageErr` | ƒ(m) → `Local storage unavailable: ${m}` | ƒ(m) → `기기 저장소를 쓸 수 없어요: ${m}` |
| `log.gettingGps` | Getting GPS position… | GPS 위치 찾는 중… |
| `log.gpsFailed` | ƒ(m) → `GPS failed: ${m}. Site left as the planning site.` | ƒ(m) → `GPS 실패: ${m}. 장소는 계획한 장소 그대로예요.` |
| `log.gpsFilled` | ƒ(m) → `GPS filled (±${m} m).` | ƒ(m) → `GPS로 채웠어요 (±${m} m).` |
| `log.confirmDelete` | Delete this log from this device? Export it first if you need it. | 이 기록을 이 기기에서 지울까요? 필요하면 먼저 내보내세요. |
| `log.noSet` | No element set on this device. Download or load one in the Satellites tab. | 이 기기에 궤도 요소(TLE)가 없어요. 위성 탭에서 내려받거나 파일을 불러오세요. |
| `log.confirmLock` | ƒ(when, date) → `Lock the element set downloaded ${when} KST as the record for ${date}?` | ƒ(when, date) → `${when} KST에 내려받은 궤도 요소를 ${date} 기록으로 고정할까요?` |
| `log.badDate` | Night not changed: enter a complete date. | 날짜를 끝까지 입력해야 바뀌어요. |
| `log.saving` | Saving… | 저장 중… |
| `log.saved` | ƒ(t) → `Saved on this device ${t}` | ƒ(t) → `이 기기에 저장함 ${t}` |
| `log.notSaved` | ƒ(m) → `NOT saved: ${m}` | ƒ(m) → `저장 안 됨: ${m}` |
| `log.issNeedStart` | Enter the actual start first. | 먼저 실제 시작 시각을 입력하세요. |
| `log.issNeedLock` | Lock an element set for this night first (see Export). | 먼저 이 밤의 궤도 요소를 고정하세요 (내보내기 참고). |
| `log.issNoSet` | Element set not found on this device. | 이 기기에서 궤도 요소를 찾을 수 없어요. |
| `log.computing` | Computing… | 계산 중… |
| `log.shadow` |  (shadow) |  (그림자) |
| `log.issHead.conv` | Conv. | 방식 |
| `log.issHead.frame` | Frame | 프레임 |
| `log.issHead.band` | Band | 구간 |
| `log.issHead.start` | Exposure start (true) | 노출 시작 (실제) |
| `log.issHead.atStart` | ISS at start (az, alt) | 시작 때 ISS (방위각, 고도) |
| `log.issHead.atEnd` | ISS at end | 끝날 때 ISS |
| `log.issNote` | ƒ(exp, half, epoch) → `A = EXIF marks the exposure start; B = EXIF marks the end (true start ${exp} s earlier). The ISS moves ≈ 1°/s here, so 1 s of timing error ≈ 1° along the track. Band: Sun at mid-exposure (frame start + ${half} s). ISS element epoch ${epoch} KST.` | ƒ(exp, half, epoch) → `A = EXIF 시각이 노출 시작, B = EXIF 시각이 노출 끝 (실제 시작은 ${exp} s 앞). 여기서 ISS는 약 1°/s로 움직여서, 시각이 1 s 틀리면 궤적을 따라 약 1° 어긋나요. 구간: 노출 중간 시점 (프레임 시작 + ${half} s)의 태양 기준. ISS 궤도 요소 기준 시각 ${epoch} KST.` |
| `log.issCsv` | Download ISS timing CSV | ISS 시각 CSV 내려받기 |
| `log.issNone` | The ISS does not enter this frame during the logged run (check pointing, start time and frame count). | 기록한 촬영 동안 ISS가 이 화면에 들어오지 않아요 (카메라 방향, 시작 시각, 프레임 수를 확인하세요). |
| `log.noObservers` | No observers entered | 관측자 없음 |
| `log.frames` | ƒ(n) → `${n} ${n === 1 ? "frame" : "frames"}` | ƒ(n) → `${n}프레임` |
| `log.title` | Field log | 관측 기록 |
| `log.intro` | One log per night: actual start and end, the camera clock check against time.is, conditions, camera and site. Saved on this phone as you type. | 밤마다 기록 하나: 실제 시작과 끝, time.is로 카메라 시계 확인, 관측 조건, 카메라, 장소. 입력하는 대로 이 휴대폰에 저장돼요. |
| `log.newLog` | ƒ(another, date) → `${another ? "Another" : "New"} log for ${date}` | ƒ(another, date) → `${date} ${another ? "기록 하나 더" : "새 기록"}` |
| `log.pastLogs` | ƒ(n) → `Past logs (${n})` | ƒ(n) → `지난 기록 (${n})` |
| `log.noLogs` | No logs yet. Logs stay on this phone until you delete them; export each one after the night. | 아직 기록이 없어요. 기록은 지우기 전까지 이 휴대폰에 남아요. 관측이 끝나면 하나씩 내보내세요. |
| `log.src.camera` | Camera clock (EXIF) | 카메라 시계 (EXIF) |
| `log.src.true` | True time (time.is) | 실제 시각 (time.is) |
| `log.src.phone` | Phone clock (Now) | 휴대폰 시계 (지금) |
| `log.plan` | ƒ(t) → `plan ${t}` | ƒ(t) → `계획 ${t}` |
| `log.startNow` | Start now | 지금 시작 |
| `log.endNow` | End now | 지금 끝 |
| `log.time` | Time | 시각 |
| `log.readFrom` | Read from | 어느 시계로 읽었나요 |
| `log.readFromAria` | ƒ(label) → `${label}: clock it was read from` | ƒ(label) → `${label}: 읽은 시계` |
| `log.clouds` | Clouds | 구름 |
| `log.cloudOpts.Clear` | Clear | 맑음 |
| `log.cloudOpts.Thin high cloud` | Thin high cloud | 얇은 높은 구름 |
| `log.cloudOpts.Partly cloudy` | Partly cloudy | 구름 조금 |
| `log.cloudOpts.Mostly cloudy` | Mostly cloudy | 구름 많음 |
| `log.cloudOpts.Overcast` | Overcast | 흐림 |
| `log.dateWarn` | ƒ(log, bar) → `This log is for ${log}; the date bar shows ${bar}. Plan times, bands and exports here use the log’s night.` | ƒ(log, bar) → `이 기록은 ${log} 기록이고, 날짜 막대는 ${bar}이에요. 여기 계획 시각, 구간, 내보내기는 기록한 밤 기준이에요.` |
| `log.allLogs` | All logs | 기록 목록 |
| `log.logTitle` | ƒ(d) → `Log · ${d}` | ƒ(d) → `기록 · ${d}` |
| `log.shooting` | Shooting | 촬영 |
| `log.startLabel` | Start (first frame) | 시작 (첫 프레임) |
| `log.endLabel` | End (last frame) | 끝 (마지막 프레임) |
| `log.framesTaken` | Frames taken | 찍은 프레임 수 |
| `log.shotsSet` | Number of Shots (set) | 촬영 매수 (설정값) |
| `log.shootingNote` | Camera-clock times are corrected by the measured offset; time.is and phone times are used as they are. “Now” fills the phone’s time and sets the source to Phone clock. | 카메라 시계로 읽은 시각은 잰 시계 오차만큼 보정해요. time.is와 휴대폰 시각은 그대로 써요. “지금”을 누르면 휴대폰 시각이 들어가고 휴대폰 시계로 바뀌어요. |
| `log.clockTitle` | Camera clock check (time.is) | 카메라 시계 확인 (time.is) |
| `log.clockNote` | For each photo of the time.is screen: the EXIF time (camera clock) and the time shown in the photo. Offset = EXIF − screen; each side uses the mean. | time.is 화면 사진마다 EXIF 시각(카메라 시계)과 사진 속 시각을 적어요. 시계 오차 = EXIF − 화면, 앞과 뒤 각각 평균을 써요. |
| `log.before` | Before shooting | 촬영 전 |
| `log.after` | After shooting | 촬영 뒤 |
| `log.howTitle` | How to take the time.is photos | time.is 사진 찍는 법 |
| `log.how` | Use a <b>fast shutter speed (e.g. 1/100 s)</b> so the digits are sharp. Take <b>5–10 shots before and 5–10 after</b>, a few seconds apart, without changing the camera time settings. EXIF DateTimeOriginal has whole-second resolution (CIPA DC-008), and time.is shows whole seconds, so one reading is only good to about ±1 s. Readings taken at different fractions of a second average to a much better estimate. If your files contain <code>SubSecTimeOriginal</code> (check with <code>exiftool -time:all</code>), enter the EXIF time to the second and note the fraction in Notes. | 숫자가 또렷하게 <b>빠른 셔터 속도 (예: 1/100 s)</b>로 찍으세요. 카메라 시간 설정은 바꾸지 말고, 몇 초 간격으로 <b>시작 전 5–10장, 끝난 뒤 5–10장</b> 찍으세요. EXIF DateTimeOriginal은 초 단위이고 (CIPA DC-008) time.is도 초 단위라서 한 장으로는 약 ±1 s밖에 안 돼요. 초의 다른 순간에 찍은 여러 장을 평균하면 훨씬 정확해져요. 파일에 <code>SubSecTimeOriginal</code>이 있으면 (<code>exiftool -time:all</code>로 확인) EXIF 시각은 초까지 적고 소수 부분은 메모에 적으세요. |
| `log.conditions` | Conditions | 관측 조건 |
| `log.weather` | Weather (wind, humidity, dew, temperature) | 날씨 (바람, 습도, 이슬, 기온) |
| `log.moon` | Moon | 달 |
| `log.notes` | Notes (airplanes, lights, interruptions) | 메모 (비행기, 불빛, 중단된 일) |
| `log.camera` | Camera | 카메라 |
| `log.azimuth` | Azimuth (°) | 방위각 (°) |
| `log.altitude` | Altitude (°) | 고도 (°) |
| `log.focal` | Focal length (mm) | 초점 거리 (mm) |
| `log.iso` | ISO | ISO |
| `log.aperture` | Aperture (f/) | 조리개 (f/) |
| `log.exposure` | Exposure (s) | 노출 (s) |
| `log.interval` | Interval (s) | 간격 (s) |
| `log.nightSite` | Night &amp; site | 날짜와 장소 |
| `log.nightDate` | Night (evening date) | 관측일 (저녁 날짜) |
| `log.gpsAcc` | GPS accuracy (m) | GPS 정확도 (m) |
| `log.observers` | Observers | 관측자 |
| `log.lat` | Latitude (°N) | 위도 (°N) |
| `log.lon` | Longitude (°E) | 경도 (°E) |
| `log.elev` | Elevation (m) | 해발 (m) |
| `log.useGps` | Use GPS | GPS 사용 |
| `log.source` | ƒ(s) → `Source: ${s}` | ƒ(s) → `출처: ${s}` |
| `log.timing` | Timing for band sorting | 구간 나누기용 시각 |
| `log.photoBand` | Photo → band | 사진 → 구간 |
| `log.exifAny` | EXIF time of any photo | 아무 사진의 EXIF 시각 |
| `log.orFrame` | …or frame number | …또는 프레임 번호 |
| `log.issTitle` | ISS timing check | ISS로 시각 확인 |
| `log.issIntro` | If the ISS crossed the frame, this lists its predicted position at the start and end of each exposure, for both EXIF conventions. Use it with the README procedure to confirm the convention and any leftover clock offset. | ISS가 화면을 지나갔다면, 노출마다 시작과 끝의 예측 위치를 두 가지 EXIF 방식으로 보여 줘요. README의 방법과 함께 써서 EXIF 방식과 남은 시계 오차를 확인하세요. |
| `log.issBtn` | Predict ISS positions per frame | 프레임별 ISS 위치 예측 |
| `log.export` | Export | 내보내기 |
| `log.setInfo` | ƒ(label, when) → `Element set: ${label}, downloaded ${when} KST` | ƒ(label, when) → `궤도 요소: ${label}, ${when} KST 내려받음` |
| `log.setId` | ƒ(id) → `Element set: ${id}` | ƒ(id) → `궤도 요소: ${id}` |
| `log.noLock` | ƒ(date) → `<b>No element set locked for ${date}.</b> The export needs the elements used that night.` | ƒ(date) → `<b>${date}에 고정한 궤도 요소가 없어요.</b> 내보내려면 그날 밤 쓴 궤도 요소가 필요해요.` |
| `log.lockLatest` | Lock the most recent element set for this night | 가장 최근 궤도 요소를 이 밤에 고정 |
| `log.bundle` | Download bundle (.zip) | 묶음 파일 내려받기 (.zip) |
| `log.bundleNote` | The bundle contains the log (CSV + JSON), the night’s elements as TLE text (.txt) plus the original OMM JSON (needed for 6-digit catalog numbers), and a README. | 묶음 파일에는 기록 (CSV + JSON), 그날 밤의 궤도 요소 TLE 텍스트 (.txt)와 원본 OMM JSON (6자리 카탈로그 번호에 필요), README가 들어 있어요. |
| `log.deleteLog` | Delete log | 기록 지우기 |
| `log.exifTime` | EXIF time | EXIF 시각 |
| `log.timeisScreen` | time.is screen | time.is 화면 |
| `log.removeReading` | ƒ(n) → `Remove reading ${n}` | ƒ(n) → `${n}번 줄 지우기` |
| `log.addReading` | Add a reading | 한 줄 더 추가 |
| `log.notMeasured` | <b>Not measured yet.</b> Without it, camera times are used as true times. | <b>아직 안 쟀어요.</b> 재기 전에는 카메라 시각을 실제 시각으로 써요. |
| `log.clock` | ƒ(before, after, drift) → `before ${before}, after ${after}${drift !== null ? `, drift ${drift}` : ""} <span class="sec">(+ = camera fast)</span>` | ƒ(before, after, drift) → `시작 전 ${before}, 끝난 뒤 ${after}${drift !== null ? `, 변화 ${drift}` : ""} <span class="sec">(+ = 카메라가 빠름)</span>` |
| `log.driftWarn` | Clock drift over 2 s: check both time.is photos. | 시계 오차 변화가 2 s보다 커요: 두 time.is 사진을 다시 확인하세요. |
| `log.intWarn` | ƒ(eff, set) → `Effective interval ${eff} s differs from the ${set} s setting. Check the frame count and the end time; frame numbers below assume ${set} s.` | ƒ(eff, set) → `실제 간격 ${eff} s가 설정값 ${set} s와 달라요. 프레임 수와 끝 시각을 확인하세요. 아래 프레임 번호는 ${set} s 기준이에요.` |
| `log.convExif` | ƒ(t, fr, sa, band) → `True ${t} · frame ${fr} · Sun ${sa}° at mid-exposure · <b>${band}</b>` | ƒ(t, fr, sa, band) → `실제 ${t} · 프레임 ${fr} · 노출 중간 시점 태양 ${sa}° · <b>${band}</b>` |
| `log.outsideRun` | outside run | 촬영 밖 |
| `log.convFrame` | ƒ(n, t, sa, band) → `Frame ${n}: starts ${t} true · Sun ${sa}° at mid-exposure · <b>${band}</b>` | ƒ(n, t, sa, band) → `프레임 ${n}: 실제 ${t} 시작 · 노출 중간 시점 태양 ${sa}° · <b>${band}</b>` |
| `log.convNote` | EXIF times are the most accurate way to sort a frame: they are corrected by the clock offset, then classified by the Sun’s altitude at mid-exposure (EXIF time + exposure/2, reading the EXIF time as the exposure start, as for the logged start). | EXIF 시각으로 나누는 게 가장 정확해요. 시계 오차로 보정한 다음, 노출 중간 시점 (EXIF 시각 + 노출/2, 기록한 시작처럼 EXIF 시각을 노출 시작으로 봄)의 태양 고도로 구간을 정해요. |
| `log.clockOffset` | Clock offset | 시계 오차 |
| `log.trueStart` | True start | 실제 시작 |
| `log.trueEnd` | True end | 실제 끝 |
| `log.effInterval` | Effective interval | 실제 간격 |
| `log.corrected` |  (corrected) |  (보정함) |
| `log.late` | ƒ(min, after) → ` · ${min} min ${after ? "after" : "before"} the planned start` | ƒ(min, after) → ` · 계획보다 ${min} min ${after ? "늦음" : "이름"}` |
| `log.enterStart` | enter the start time | 시작 시각을 입력하세요 |
| `log.effVal` | ƒ(eff, n) → `${eff} s (${n} frames)` | ƒ(eff, n) → `${eff} s (${n}프레임)` |
| `log.thBand` | Band | 구간 |
| `log.thSunTimes` | Sun-angle times (KST) | 태양 고도 시각 (KST) |
| `log.thActual` | Frames (actual) | 프레임 (실제) |
| `log.thPlanned` | Planned | 계획 |
| `log.bandNote` | ƒ(half, interval, start, e, i) → `A frame belongs to a band if the Sun’s altitude at its mid-exposure (frame start + ${half} s) is inside the band; frames from the true start and the ${interval}-s interval. "Planned" assumes the scheduled start (${start}) with the planned ${e}-s exposure and ${i}-s interval.` | ƒ(half, interval, start, e, i) → `노출 중간 시점 (프레임 시작 + ${half} s)의 태양 고도가 구간 안에 있으면 그 프레임은 그 구간에 들어가요. 프레임은 실제 시작과 간격 ${interval} s로 셌어요. “계획”은 예정한 시작 (${start}), 노출 ${e} s, 간격 ${i} s 기준이에요.` |

## Satellites tab

| Key | English | 한국어 |
|---|---|---|
| `sats.band.twilight` | Twilight | 박명 |
| `sats.band.dark` | Dark | 어둠 |
| `sats.band.gap` | Gap | 사이 |
| `sats.band.outside` | Margin | 여유 |
| `sats.model.peak` | Peak (Hainaut & Williams 2020) | 피크 (Hainaut & Williams 2020) |
| `sats.model.matched` | Matched filter (Jones et al. 2018 SNR loss) | 정합 필터 (Jones et al. 2018 SNR 손실) |
| `sats.model.fixed` | Fixed limit | 고정 한계 |
| `sats.storageErr` | ƒ(m) → `Local storage (IndexedDB) unavailable: ${m}` | ƒ(m) → `기기 저장소(IndexedDB)를 쓸 수 없어요: ${m}` |
| `sats.setTextMissing` | Element set text missing from storage | 저장소에 궤도 요소 내용이 없어요 |
| `sats.noUsable` | ƒ(label, failed) → `No usable elements in ${label} (${failed} failed to parse).` | ƒ(label, failed) → `${label}에 쓸 수 있는 궤도 요소가 없어요 (${failed}개 읽기 실패).` |
| `sats.savedSet` | ƒ(loaded, failed) → `Saved: ${loaded} objects loaded, ${failed} failed to parse.` | ƒ(loaded, failed) → `저장함: ${loaded}개 불러옴, ${failed}개 읽기 실패.` |
| `sats.busyDownload` | Downloading from CelesTrak… | CelesTrak에서 내려받는 중… |
| `sats.busyPaste` | Loading pasted elements… | 붙여 넣은 궤도 요소 불러오는 중… |
| `sats.pasteFirst` | Paste OMM JSON or TLE text first. | 먼저 OMM JSON이나 TLE 텍스트를 붙여 넣으세요. |
| `sats.busySaving` | Saving… | 저장 중… |
| `sats.confirmRelock` | ƒ(date, when) → `${date} is already locked to the set from ${when}. Re-lock it to the selected set? (The change is recorded.)` | ƒ(date, when) → `${date}은(는) 이미 ${when}의 궤도 요소에 고정돼 있어요. 고른 궤도 요소로 바꿀까요? (바꾼 기록이 남아요.)` |
| `sats.busyFile` | Preparing file… | 파일 준비 중… |
| `sats.busyDelete` | Deleting… | 지우는 중… |
| `sats.confirmDelete` | Delete this element set from this device? This cannot be undone. | 이 궤도 요소를 이 기기에서 지울까요? 되돌릴 수 없어요. |
| `sats.busyPasses` | Computing ISS passes… | ISS 하늘 통과 계산 중… |
| `sats.loadFirst` | Load an element set first. | 먼저 궤도 요소를 불러오세요. |
| `sats.busyLoading` | ƒ(name) → `Loading ${name}…` | ƒ(name) → `${name} 불러오는 중…` |
| `sats.setNotFound` | Element set not found. | 궤도 요소를 찾을 수 없어요. |
| `sats.tleOnly` | This set was imported as TLE text; export it as TLE. | 이 궤도 요소는 TLE 텍스트로 불러온 거라 TLE로만 내보낼 수 있어요. |
| `sats.tleWritten` | ƒ(w, s) → `TLE file: ${w} objects written; ${s} with catalog numbers > 99999 omitted (TLE cannot hold them — they are in the OMM JSON file).` | ƒ(w, s) → `TLE 파일: ${w}개 저장, 카탈로그 번호가 99999보다 큰 ${s}개는 뺐어요 (TLE에 담을 수 없어서 OMM JSON 파일에 있어요).` |
| `sats.noWindowDate` | No shooting window on this date. | 이 날은 촬영 시간이 없어요. |
| `sats.busyPropagate` | Propagating every satellite… | 모든 위성 위치 계산 중… |
| `sats.errPolicy` | ƒ(t) → `CelesTrak policy: next download allowed after ${t} KST.` | ƒ(t) → `CelesTrak 규칙: 다음 내려받기는 ${t} KST 뒤에 할 수 있어요.` |
| `sats.errOffline` | Could not reach CelesTrak (offline or blocked by the browser). Load a file instead. | CelesTrak에 연결하지 못했어요 (오프라인이거나 브라우저가 막음). 파일을 불러오세요. |
| `sats.errRefused` | ƒ(why) → `CelesTrak refused the request (${why}). Not retrying for 2 h. Load a file instead.` | ƒ(why) → `CelesTrak이 요청을 거절했어요 (${why}). 2시간 동안 다시 시도하지 않아요. 파일을 불러오세요.` |
| `sats.source` | Source | 출처 |
| `sats.downloadedAt` | Downloaded at | 내려받은 시각 |
| `sats.importedAt` | Imported at | 불러온 시각 |
| `sats.objects` | Objects | 천체 수 |
| `sats.objectsVal` | ƒ(loaded, failed, six) → [`${loaded} loaded`, `${failed} failed to parse`, `${six} with catalog no. ≥ 100000`] | ƒ(loaded, failed, six) → [`${loaded}개 불러옴`, `${failed}개 읽기 실패`, `카탈로그 번호 ≥ 100000: ${six}개`] |
| `sats.epochs` | Element epochs | 궤도 요소 기준 시각 |
| `sats.parseFailures` | ƒ(n) → `Parse failures (${n})` | ƒ(n) → `읽기 실패 (${n})` |
| `sats.noSetYet` | No element set yet. Download from CelesTrak or load a file. | 아직 궤도 요소가 없어요. CelesTrak에서 내려받거나 파일을 불러오세요. |
| `sats.locked` | ƒ(date, when, changes) → `${date} is locked to the set downloaded ${when} KST${changes ? ` (changed ${changes}×)` : ""}. Predictions for this night always use it.` | ƒ(date, when, changes) → `${date}은(는) ${when} KST에 내려받은 궤도 요소에 고정돼 있어요${changes ? ` (${changes}번 바뀜)` : ""}. 이 밤의 예측은 항상 이 궤도 요소를 써요.` |
| `sats.notLocked` | ƒ(date) → `Not locked for ${date}. Lock the set you use on the night so the record is fixed (computing predictions for tonight locks it automatically).` | ƒ(date) → `${date}에 고정된 궤도 요소가 없어요. 기록이 바뀌지 않도록 그날 밤 쓰는 궤도 요소를 고정하세요 (오늘 밤 예측을 계산하면 저절로 고정돼요).` |
| `sats.obj` | obj | 개 |
| `sats.lockedFor` | ƒ(nights) → ` · locked for ${nights}` | ƒ(nights) → ` · 고정: ${nights}` |
| `sats.delete` | Delete | 지우기 |
| `sats.elementsTitle` | Orbital elements | 궤도 요소 |
| `sats.download` | Download from CelesTrak | CelesTrak에서 내려받기 |
| `sats.loadFile` | Load file… | 파일 불러오기… |
| `sats.policyOk` | One download per 2 h (CelesTrak policy). ~7 MB. | 2시간에 한 번만 내려받을 수 있어요 (CelesTrak 규칙). 약 7 MB. |
| `sats.policyWait` | ƒ(t) → `CelesTrak policy: next download after ${t} KST. Use the saved set or load a file.` | ƒ(t) → `CelesTrak 규칙: 다음 내려받기는 ${t} KST 뒤예요. 저장된 궤도 요소를 쓰거나 파일을 불러오세요.` |
| `sats.pasteTitle` | Paste OMM JSON or TLE text | OMM JSON이나 TLE 텍스트 붙여 넣기 |
| `sats.pastePh` | [ {"OBJECT_NAME": …} ]  or  name / line 1 / line 2 | [ {"OBJECT_NAME": …} ]  또는  이름 / 1행 / 2행 |
| `sats.loadPasted` | Load pasted text | 붙여 넣은 내용 불러오기 |
| `sats.setFor` | ƒ(date) → `Set for ${date}` | ƒ(date) → `${date}에 쓸 궤도 요소` |
| `sats.lockedBtn` | Locked | 고정됨 |
| `sats.relock` | Re-lock to this set | 이 궤도 요소로 다시 고정 |
| `sats.lockNight` | Lock for this night | 이 밤에 고정 |
| `sats.differs` | The selected set differs from this night’s locked set. Predictions use the locked set. | 고른 궤도 요소가 이 밤에 고정된 것과 달라요. 예측은 고정된 궤도 요소를 써요. |
| `sats.savedSets` | ƒ(n) → `Saved sets (${n}) · export for the research record` | ƒ(n) → `저장된 궤도 요소 (${n}) · 연구 기록용 내보내기` |
| `sats.savedNote` | JSON = the exact OMM data as downloaded. TLE = 3-line elements generated from the OMM for objects with catalog numbers ≤ 99999 (TLE cannot hold 6-digit numbers). | JSON = 내려받은 그대로의 OMM 데이터. TLE = 카탈로그 번호가 99999 이하인 천체에 대해 OMM에서 만든 3줄 궤도 요소 (TLE에는 6자리 번호를 담을 수 없어요). |
| `sats.cameraTitle` | Camera | 카메라 |
| `sats.azimuth` | Azimuth (°) | 방위각 (°) |
| `sats.altitude` | Altitude (°) | 고도 (°) |
| `sats.focal` | Focal length (mm) | 초점 거리 (mm) |
| `sats.sensorW` | Sensor W (mm) | 센서 가로 (mm) |
| `sats.sensorH` | Sensor H (mm) | 센서 세로 (mm) |
| `sats.fov` | Field of view (landscape) | 화각 (가로 방향) |
| `sats.diagonal` | ƒ(d) → `diagonal ${d}°` | ƒ(d) → `대각선 ${d}°` |
| `sats.cameraNote` | ƒ(dir) → `Azimuth from north through east (${dir}). FOV = 2·atan(sensor ÷ 2f). Frame test: gnomonic projection about the pointing direction, horizon level.` | ƒ(dir) → `방위각은 북쪽에서 동쪽으로 잰 값 (${dir}). 화각 = 2·atan(센서 ÷ 2f). 화면 판정: 카메라 방향 중심의 심사 도법, 수평 맞춤.` |
| `sats.recompute` | Recompute crossings | 통과 다시 계산 |
| `sats.compute` | Compute crossings | 통과 계산 |
| `sats.inFrame` | ƒ(d) → `In the frame · ${d}` | ƒ(d) → `화면 안 · ${d}` |
| `sats.computeIss` | Compute crossings to see whether the ISS crosses the frame tonight. | 통과를 계산하면 오늘 밤 ISS가 화면을 지나가는지 알 수 있어요. |
| `sats.loadSetFirst` | Load an element set first (Orbital elements, below). | 먼저 궤도 요소를 불러오세요 (아래 궤도 요소). |
| `sats.computeNote` | ƒ(a, b) → `Propagates every object at 10-s steps over ${a}–${b} KST and finds those that are above the horizon, sunlit and inside the frame. Takes ~10–40 s on a phone.` | ƒ(a, b) → `${a}–${b} KST 동안 모든 천체를 10 s 간격으로 계산해서, 지평선 위에 있고 햇빛을 받으며 화면 안에 들어오는 천체를 찾아요. 휴대폰에서 약 10–40 s 걸려요.` |
| `sats.bandMin` | ƒ(band, m) → `${band} band · ${m} min` | ƒ(band, m) → `${band} 구간 · ${m} min` |
| `sats.perH` | ƒ(h) → `crossings · ${h}/h` | ƒ(h) → `통과 · ${h}/h` |
| `sats.detectable` | predicted detectable: | 검출 가능 예측: |
| `sats.peak` | Peak | 피크 |
| `sats.matched` | Matched filter | 정합 필터 |
| `sats.fixedLe` | ƒ(l) → `fixed ≤ ${l}` | ƒ(l) → `고정 ≤ ${l}` |
| `sats.unknownBright` | ƒ(n) → `${n} with unknown brightness` | ƒ(n) → `밝기 모름 ${n}개` |
| `sats.leoOnly` | ƒ(n, hidden) → `LEO only (period &lt; 128 min) · ${n} MEO/GEO/HEO ${hidden ? "hidden" : "included"}` | ƒ(n, hidden) → `LEO만 (주기 &lt; 128 min) · MEO/GEO/HEO ${n}개 ${hidden ? "숨김" : "포함"}` |
| `sats.summary` | ƒ(gap, out, objs, failed, merged, station, stKm, trains, trKm, steps, secs, when) → `Also ${gap} between the bands and ${out} in the 5-min margins. ${objs} objects propagated, ${failed} failed (decayed / SGP4 error), ${merged} merged (identical element sets: docked modules/vehicles), ${station} merged into a crewed station (within ${stKm} km of the ISS or Tiangong while in frame), ${trains} crossings flagged train (another crossing object within ${trKm} km) · ${steps} steps · ${secs} s. Elements: ${when} KST.` | ƒ(gap, out, objs, failed, merged, station, stKm, trains, trKm, steps, secs, when) → `그 밖에 구간 사이 ${gap}개, 앞뒤 5 min 여유 시간 ${out}개. 계산한 천체 ${objs}개, 실패 ${failed}개 (추락 / SGP4 오류), 합침 ${merged}개 (궤도 요소가 같음: 도킹된 모듈·비행체), 유인 우주정거장에 합침 ${station}개 (화면 안에 있는 동안 ISS나 톈궁에서 ${stKm} km 이내), 줄지어 비행 표시 ${trains}개 (다른 통과 천체가 ${trKm} km 이내) · ${steps}단계 · ${secs} s. 궤도 요소: ${when} KST.` |
| `sats.crossings` | ƒ(n) → `Crossings (${n})` | ƒ(n) → `통과 (${n})` |
| `sats.thEnterExit` | Enter / exit (KST) | 들어옴 / 나감 (KST) |
| `sats.thObject` | Object | 천체 |
| `sats.thMaxAlt` | Max alt | 최고 고도 |
| `sats.thMag` | Mag | 등급 |
| `sats.thBand` | Band | 구간 |
| `sats.version` | ƒ(v) → `version ${v}` | ƒ(v) → `버전 ${v}` |
| `sats.docked` | ƒ(n) → ` · +${n} docked/visiting` | ƒ(n) → ` · 도킹된 비행체 +${n}` |
| `sats.train` | ƒ(n, km) → ` · <b>train</b> (${n} within ${km} km)` | ƒ(n, km) → ` · <b>줄지어 비행</b> (${km} km 이내 ${n}개)` |
| `sats.listNote` | * already inside the frame at window start / still inside at window end. Entry/exit refined to 0.1 s; band from the Sun’s altitude at the crossing midpoint. Mag = brightest predicted magnitude in the frame (10-s samples); below it the limit that applies to this crossing and the trail length in one frame; bold = predicted detectable. “—” = no published intrinsic magnitude; “a” = assumed value. Starlink versions from GCAT; “version uncertain / not-in-gcat” = no magnitude assigned. Geostationary and GPS-type (MEO) objects barely move in 15 s and many stay in the frame for the whole window, so they are not counted as crossings by default. The CSV always contains every object, with its regime. | * 촬영 시작 때 이미 화면 안 / 촬영 끝날 때 아직 화면 안. 들어옴/나감은 0.1 s까지 계산, 구간은 통과 중간 시점의 태양 고도 기준. 등급 = 화면 안에서 가장 밝은 예측 등급 (10 s 표본). 그 아래는 이 통과에 적용되는 한계 등급과 한 프레임의 궤적 길이. 굵은 글씨 = 검출 가능 예측. “—” = 발표된 고유 등급 없음, “a” = 가정한 값. 스타링크 버전은 GCAT 기준, “version uncertain / not-in-gcat” = 등급을 정하지 않음. 정지궤도와 GPS 같은 중궤도(MEO) 천체는 15 s 동안 거의 움직이지 않고 대부분 촬영 내내 화면에 있어서 기본으로는 통과로 세지 않아요. CSV에는 모든 천체가 궤도 종류와 함께 들어 있어요. |
| `sats.csv` | Download CSV | CSV 내려받기 |
| `sats.issBadge` | ISS | ISS |
| `sats.issCrosses` | Crosses this frame tonight | 오늘 밤 이 화면을 지나가요 |
| `sats.issNo` | Does not enter this frame tonight | 오늘 밤 이 화면에는 안 들어와요 |
| `sats.issNoPass` | No ISS pass during the shooting window | 촬영 시간에 ISS 하늘 통과가 없어요 |
| `sats.enters` | Enters | 들어옴 |
| `sats.exits` | Exits | 나감 |
| `sats.issFrames` | ƒ(a, b) → `Frames ${a}${b !== null && b !== a ? `–${b}` : ""}` | ƒ(a, b) → `프레임 ${a}${b !== null && b !== a ? `–${b}` : ""}` |
| `sats.ifOnTime` |  if started on time ·  |  (정시 시작 기준) ·  |
| `sats.inFrameS` | ƒ(s) → `${s} s in frame` | ƒ(s) → `화면 안 ${s} s` |
| `sats.bandOf` | ƒ(band) → `${band} band` | ƒ(band) → `${band} 구간` |
| `sats.issDetail` | ƒ(alt, mag, trail, lims) → `Max alt ${alt}° · predicted mag ${mag}${trail !== null ? ` · trail ≈ ${trail} px per frame` : ""}${lims ?? ""}` | ƒ(alt, mag, trail, lims) → `최고 고도 ${alt}° · 예측 등급 ${mag}${trail !== null ? ` · 궤적 길이 약 ${trail} px/프레임` : ""}${lims ?? ""}` |
| `sats.issLims` | ƒ(p, pd, m, md) → ` · Peak limit ${p} → ${pd ? "detectable" : "not detectable"} · Matched-filter limit ${m} → ${md ? "detectable" : "not detectable"}` | ƒ(p, pd, m, md) → ` · 피크 한계 ${p} → ${pd ? "검출 가능" : "검출 불가"} · 정합 필터 한계 ${m} → ${md ? "검출 가능" : "검출 불가"}` |
| `sats.pass` | ƒ(t) → `Pass: ${t}` | ƒ(t) → `하늘 통과: ${t}` |
| `sats.passVisible` | ƒ(a, b, c) → `visible ${a} → highest ${b} → ${c}` | ƒ(a, b, c) → `보임 ${a} → 가장 높음 ${b} → ${c}` |
| `sats.passNotVisible` | ƒ(a, b) → `above horizon ${a}–${b} but not visible (in shadow or Sun too high)` | ƒ(a, b) → `${a}–${b} 지평선 위지만 안 보임 (그림자 속이거나 태양이 너무 높음)` |
| `sats.passOtherFrames` | The ISS column in the pointing table shows the frames it does cross. | ISS가 지나가는 화면은 카메라 방향 비교 표의 ISS 열에 있어요. |
| `sats.magTitle` | Brightness and detection model | 밝기와 검출 모델 |
| `sats.starLimit` | ƒ(e) → `Star limit, ${e}-s frame` | ƒ(e) → `별 한계 등급, ${e} s 프레임` |
| `sats.placeholder` | (placeholder) | (임시값) |
| `sats.fwhm` | PSF FWHM (px) | PSF FWHM (px) |
| `sats.pixels` | Pixels across sensor | 센서 가로 픽셀 수 |
| `sats.pixScale` | Pixel scale | 픽셀 크기 |
| `sats.fixedLimit` | Fixed limit | 고정 한계 |
| `sats.boldIn` | Bold in list | 목록에서 굵게 |
| `sats.phaseLaw` | Phase law | 위상 법칙 |
| `sats.lawFraction` | Fraction illuminated | 빛나는 면 비율 |
| `sats.lawLambert` | Diffuse (Lambert) sphere | 확산 (램버트) 구 |
| `sats.assumed` | Assumed 1000-km mag for objects with no published value | 발표된 값이 없는 천체에 가정할 1000 km 등급 |
| `sats.assumedPh` | leave blank = unknown | 비우면 = 모름 |
| `sats.magNote` | ƒ(e, star, lim) → `m = m₁₀₀₀ + 5·log₁₀(range/1000 km) − 2.5·log₁₀F(phase angle), F = 1 at 90°. m₁₀₀₀ from Mallama &amp; Cole’s compiled table (Starlink by version, OneWeb, Amazon Leo, Qianfan) and Heavens-Above (ISS); see README for every source and flag. Two trailing-loss models on the same samples, with x = trail length ÷ FWHM (trail length = angular speed × ${e} s ÷ pixel scale): <b>Peak</b> m<sub>lim,sat</sub> = m<sub>lim,star</sub> − 2.5·log₁₀x (Hainaut &amp; Williams 2020, A&amp;A 636, A121, §5); <b>Matched filter</b> m<sub>lim,sat</sub> = m<sub>lim,star</sub> − 1.25·log₁₀(1 + 0.67x²/(1 + 1.16x)) (Jones et al. 2018, Icarus, Eqs. 4–5, SNR trailing loss). For a 500-px streak at FWHM 2 px they give losses of 6.0 and 2.7 mag. In the list: P = Peak limit, M = Matched-filter limit, ✓ = detectable. All limits (star limit ${star}, fixed limit ${lim}) are <b>placeholders</b> until you calibrate them from your photos. Changing the phase law needs a recompute.` | ƒ(e, star, lim) → `m = m₁₀₀₀ + 5·log₁₀(거리/1000 km) − 2.5·log₁₀F(위상각), 90°에서 F = 1. m₁₀₀₀은 Mallama &amp; Cole이 정리한 표 (스타링크 버전별, OneWeb, Amazon Leo, Qianfan)와 Heavens-Above (ISS)에서 가져왔어요. 모든 출처와 표시는 README에 있어요. 같은 표본에 궤적 손실 모델 두 개를 써요. x = 궤적 길이 ÷ FWHM (궤적 길이 = 각속도 × ${e} s ÷ 픽셀 크기): <b>피크</b> m<sub>lim,sat</sub> = m<sub>lim,star</sub> − 2.5·log₁₀x (Hainaut &amp; Williams 2020, A&amp;A 636, A121, §5), <b>정합 필터</b> m<sub>lim,sat</sub> = m<sub>lim,star</sub> − 1.25·log₁₀(1 + 0.67x²/(1 + 1.16x)) (Jones et al. 2018, Icarus, Eqs. 4–5, SNR trailing loss). FWHM 2 px에서 500 px 궤적이면 손실은 6.0등급과 2.7등급이에요. 목록에서 P = 피크 한계, M = 정합 필터 한계, ✓ = 검출 가능. 모든 한계 (별 한계 ${star}, 고정 한계 ${lim})는 사진으로 보정하기 전까지 <b>임시값</b>이에요. 위상 법칙을 바꾸면 다시 계산해야 해요.` |
| `sats.pointingTitle` | Pointing comparison | 카메라 방향 비교 |
| `sats.thAzAlt` | Az / alt | 방위각 / 고도 |
| `sats.thSunDaz` | Sun Δaz | 태양 Δ방위각 |
| `sats.thMoon` | Moon | 달 |
| `sats.thAll` | All | 전체 |
| `sats.twDk` | twilight / dark | 박명 / 어둠 |
| `sats.thPeak` | Peak | 피크 |
| `sats.thMatched` | Matched | 정합 |
| `sats.thIss` | ISS in frame | 화면 안 ISS |
| `sats.issRes` | KST, 10-s | KST, 10 s |
| `sats.down` | down | 안 뜸 |
| `sats.pointingNote` | ƒ(leo, sun) → `${leo ? "LEO crossings" : "Crossings (all regimes)"} per band for the same lens pointed elsewhere (10-s resolution). Bold = highest; shaded = your current pointing if it is on this grid. <b>Sun Δaz</b> = azimuth difference from the Sun at the start of the twilight band (${sun}); small values look towards the residual twilight glow. <b>Moon</b> = smallest angular distance from the frame centre to the Moon while it is up during the window (“down” = below the horizon all window). <b>ISS in frame</b> = first–last 10-s sample with the ISS inside that frame (exact times for your chosen pointing are in the box above). Keep one pointing all night so both bands are comparable.` | ƒ(leo, sun) → `같은 렌즈를 다른 방향으로 돌렸을 때 구간별 ${leo ? "LEO 통과" : "통과 (모든 궤도)"} 수 (10 s 간격). 굵은 글씨 = 가장 많음, 음영 = 지금 카메라 방향 (이 격자에 있을 때). <b>태양 Δ방위각</b> = 박명 구간이 시작할 때 태양과의 방위각 차이 (${sun}). 값이 작으면 남은 박명 빛 쪽을 봐요. <b>달</b> = 촬영 중 달이 떠 있는 동안 화면 중심에서 달까지 가장 가까운 각거리 (“안 뜸” = 촬영 내내 지평선 아래). <b>화면 안 ISS</b> = ISS가 그 화면 안에 있는 첫–마지막 10 s 표본 (고른 방향의 정확한 시각은 위 상자에 있어요). 두 구간을 비교할 수 있도록 밤새 한 방향을 유지하세요.` |
| `sats.sunAt` | ƒ(az, dir, t) → `Sun at ${az}° ${dir}, ${t} KST` | ƒ(az, dir, t) → `태양 ${az}° ${dir}, ${t} KST` |
| `sats.passesTitle` | ISS passes, next 14 days | ISS 하늘 통과, 앞으로 14일 |
| `sats.findPasses` | Find ISS passes (14 days) | ISS 하늘 통과 찾기 (14일) |
| `sats.recomputePasses` | Recompute | 다시 계산 |
| `sats.passesIntro` | Visible evening passes over the next 14 days (sunlit, highest visible altitude ≥ 30°), to choose a test night. | 시험할 밤을 고르는 용도: 앞으로 14일 동안 저녁에 보이는 통과 (햇빛을 받고, 보이는 최고 고도 ≥ 30°). |
| `sats.showAll` | Show all visible passes (morning, low) | 보이는 통과 모두 보기 (새벽, 낮은 것) |
| `sats.thDate` | Date | 날짜 |
| `sats.thStart` | Start | 시작 |
| `sats.thHighest` | Highest | 가장 높음 |
| `sats.thEnd` | End | 끝 |
| `sats.sunAlt` | ƒ(a) → `Sun ${a}°` | ƒ(a) → `태양 ${a}°` |
| `sats.noPasses` | No passes match. | 맞는 통과가 없어요. |
| `sats.passesNote` | ƒ(epoch, age) → `KST. Start/End = ISS reaches 10° altitude or leaves/enters Earth’s shadow; Highest = highest visible point (same definitions as Heavens-Above). Visible = sunlit while the Sun is below −6°. Elements epoch ${epoch} KST (${age} d old): passes more than a few days ahead shift as the ISS reboosts, so recheck with fresh elements.` | ƒ(epoch, age) → `KST. 시작/끝 = ISS가 고도 10°에 닿거나 지구 그림자를 나가고 들어가는 때, 가장 높음 = 보이는 가장 높은 지점 (Heavens-Above와 같은 정의). 보임 = 태양이 −6° 아래일 때 햇빛을 받음. 궤도 요소 기준 시각 ${epoch} KST (${age}일 지남): ISS가 궤도를 올리면 며칠 뒤 통과는 달라지니, 새 궤도 요소로 다시 확인하세요.` |
| `sats.chartAria` | All-sky chart: camera field of view, Moon and predicted satellite tracks | 전천 지도: 카메라 화각, 달, 예측한 위성 궤적 |
| `sats.legTwilight` | Twilight band | 박명 구간 |
| `sats.legDark` | Dark band (dashed) | 어두운 구간 (점선) |
| `sats.legOther` | Other times | 다른 시간 |
| `sats.legFrame` | Camera frame | 카메라 화면 |
| `sats.moonLabel` | Moon | 달 |
| `sats.chartNote` | Zenith at centre, horizon on the rim, North up, <b>East left</b> (view looking up). Tracks: sunlit, above-horizon parts of satellites that cross the frame. Moon at window midpoint. | 가운데가 천정, 가장자리가 지평선, 위쪽이 북쪽, <b>왼쪽이 동쪽</b> (누워서 올려다본 모습). 궤적: 화면을 지나가는 위성 가운데 햇빛을 받고 지평선 위에 있는 부분. 달은 촬영 시간 가운데 시점 위치. |
| `sats.compassLetters.N` | N | 북 |
| `sats.compassLetters.E` | E | 동 |
| `sats.compassLetters.S` | S | 남 |
| `sats.compassLetters.W` | W | 서 |

## 14 nights

| Key | English | 한국어 |
|---|---|---|
| `outlook.rating.good` | Good | 좋음 |
| `outlook.rating.fair` | Fair | 보통 |
| `outlook.rating.poor` | Poor | 나쁨 |
| `outlook.rating.none` | No window | 촬영 불가 |
| `outlook.loading` | Loading cloud forecast from Open-Meteo… | Open-Meteo에서 구름 예보 받는 중… |
| `outlook.fetched` | ƒ(t) → `Cloud forecast fetched ${t} KST.` | ƒ(t) → `구름 예보 ${t} KST에 받음.` |
| `outlook.failed` | ƒ(m) → `Cloud forecast unavailable (${m}). Moon data is still valid.` | ƒ(m) → `구름 예보를 받을 수 없어요 (${m}). 달 정보는 그대로 맞아요.` |
| `outlook.title` | Next 14 nights | 앞으로 14일 밤 |
| `outlook.good` | ƒ(n) → n ? `<b>${n}</b> good night${n > 1 ? "s" : ""}, circled.` : "No night meets the “good” criteria yet." | ƒ(n) → n ? `좋은 밤 <b>${n}</b>일, 동그라미 표시.` : "아직 “좋음” 기준에 맞는 밤이 없어요." |
| `outlook.tap` | Tap a night for its schedule. | 밤을 누르면 그날 계획이 나와요. |
| `outlook.refresh` | Refresh | 새로 고침 |
| `outlook.legWindow` | shooting window | 촬영 시간 |
| `outlook.legBands` | twilight / dark band | 박명 / 어두운 구간 |
| `outlook.legMoon` | Moon up | 달이 뜬 시간 |
| `outlook.criteriaTitle` | How nights are rated | 밤을 평가하는 기준 |
| `outlook.criteria` | ƒ(moonNone, moonLow, clear, partly) → [ `<b>Moon index</b> = illuminated % × fraction of the window the Moon is above the horizon (0 = no Moon, 100 = full Moon all window). ≤ ${moonNone}: no Moon; ≤ ${moonLow}: low; above: bright.`, `<b>Cloud</b> = mean total cloud cover over the window (hourly forecast, linearly interpolated, sampled every 10 min). ≤ ${clear}%: clear; ≤ ${partly}%: partly; above: cloudy.`, "<b>Good</b> = no/low Moon and clear. <b>Fair</b> = no/low Moon with partly cloudy or no forecast, or clear with a bright Moon. <b>Poor</b> = the rest.", "Forecasts several days ahead are unreliable; recheck the day before." ] | ƒ(moonNone, moonLow, clear, partly) → [ `<b>달 지수</b> = 달 밝기 % × 촬영 시간 중 달이 지평선 위에 있는 비율 (0 = 달 없음, 100 = 촬영 내내 보름달). ${moonNone} 이하: 달 없음, ${moonLow} 이하: 약함, 그보다 크면: 밝음.`, `<b>구름</b> = 촬영 시간 동안의 평균 전체 구름양 (매시간 예보를 직선으로 이어서 10 min마다 표본). ${clear}% 이하: 맑음, ${partly}% 이하: 구름 조금, 그보다 많으면: 흐림.`, "<b>좋음</b> = 달이 없거나 약하고 맑음. <b>보통</b> = 달이 없거나 약한데 구름 조금이거나 예보 없음, 또는 맑은데 달이 밝음. <b>나쁨</b> = 그 밖의 경우.", "며칠 뒤 예보는 잘 안 맞아요. 전날 다시 확인하세요." ] |
| `outlook.tonight` | Tonight | 오늘 밤 |
| `outlook.noSun35` | Sun does not reach −35° | 태양이 −35°까지 안 내려감 |
| `outlook.noWindow` | no window | 촬영 시간 없음 |
| `outlook.windowShots` | ƒ(a, b, n) → `${a}–${b} · ${n} shots` | ƒ(a, b, n) → `${a}–${b} · ${n}장` |
| `outlook.moon` | ƒ(p, up, idx) → `Moon ${p}% · ${up}${idx !== null ? ` · index ${idx}` : ""}` | ƒ(p, up, idx) → `달 ${p}% · ${up}${idx !== null ? ` · 지수 ${idx}` : ""}` |
| `outlook.notUp` | not up | 안 뜸 |
| `outlook.upAll` | ƒ(m) → `up all ${m} min` | ƒ(m) → `${m} min 내내 뜸` |
| `outlook.upOf` | ƒ(a, b) → `up ${a} of ${b} min` | ƒ(a, b) → `${b} min 중 ${a} min 뜸` |
| `outlook.cloud` | cloud | 구름 |
