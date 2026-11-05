# Glossary: fixed Korean terms

One Korean term per research term, used everywhere in the app (`src/i18n/ko.ts`). Numbers, symbols (°, km, px,
mag, %), KST times, catalog numbers and citations are never translated. Time words are Korean (see below). Exports (CSV/JSON column names, header comments, bundle
README) stay in English.

| English | 한국어 | Note |
|---|---|---|
| twilight band (Sun −12° → −20°) | 박명 구간 | fixed by the project |
| dark band (Sun −25° → −35°) | 어두운 구간 | fixed by the project |
| band (either) | 구간 | |
| between the bands (gap) | 구간 사이 | |
| 5-min margin | 앞뒤 여유 시간 | |
| frame | 프레임 | fixed by the project |
| frame now | 지금 프레임 | |
| shooting window | 촬영 시간 | |
| Number of Shots (camera menu) | 촬영 매수 | Sony a7 III Korean menu term |
| shots | 장 | “476장” |
| exposure | 노출 | “노출 15초” |
| interval | 간격 | “간격 16초” |
| mid-exposure | 노출 중간 시점 | |
| element set / TLE | 궤도 요소(TLE) | fixed by the project; “궤도 요소” after first use |
| OMM | OMM | not translated |
| crossing (object passes through the camera frame) | 화각 통과 | fixed by the project |
| pass (ISS over the sky) | 통과 | “ISS 통과” |
| detectable | 검출 가능 | fixed by the project |
| not detectable | 검출 불가 | |
| magnitude | 등급 | |
| limiting magnitude | 한계 등급 | |
| trail (streak length) | 궤적 길이 | |
| train (objects flying together) | 줄지어 비행 | |
| docked / visiting vehicles | 도킹된 비행체 | |
| lock (an element set to a night) | 고정 | “이 밤에 고정” |
| field log | 관측 기록 | |
| observers | 관측자 | |
| site | 관측 장소 | |
| camera clock (EXIF) | 카메라 시계(EXIF) | |
| true time (time.is) | 실제 시각(time.is) | |
| phone clock | 휴대폰 시계 | |
| clock offset | 시계 오차 | |
| clock drift | 시계 오차 변화 | |
| Sun altitude | 태양 고도 | |
| sunset | 일몰 | |
| civil / nautical / astronomical twilight ends | 시민 / 항해 / 천문 박명 끝 | standard Korean terms (KASI) |
| moonrise / moonset | 월출 / 월몰 | |
| % lit (Moon) | 밝기 %, 달이 빛나는 면 | “달 4%” |
| azimuth / altitude | 방위각 / 고도 | |
| focal length | 초점 거리 | |
| field of view | 화각 | |
| pointing | 카메라 방향 | |
| cloud cover | 구름양 | |
| forecast | 예보 | |
| good / fair / poor / no window | 좋음 / 보통 / 나쁨 / 촬영 불가 | |
| night mode / day mode | 야간 모드 / 주간 모드 | |
| tonight | 오늘 밤 | |
| download / load file / export | 내려받기 / 파일 불러오기 / 내보내기 | |

## Moon phases

| English | 한국어 |
|---|---|
| New Moon | 삭 |
| Waxing crescent | 초승달 |
| First quarter | 상현달 |
| Waxing gibbous | 차오르는 달 |
| Full Moon | 보름달 |
| Waning gibbous | 기우는 달 |
| Last quarter | 하현달 |
| Waning crescent | 그믐달 |

## Time words

| English | 한국어 | Example |
|---|---|---|
| s | 초 | 노출 15초, 10초 간격 |
| min | 분 | 35분 남음, 앞뒤 5분 여유 시간 |
| h | 시간 | 2시간 7분 (minutes not zero-padded), 691.6/시간 |
| d (day offset) | 일 | 09:54 (+1일) |
| °/s | °/초 | 약 1°/초 |
