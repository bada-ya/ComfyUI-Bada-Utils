# 🌊 ComfyUI-Bada-Utils (바다 유틸 종합 올인원 팩)

<div align="center">

![Platform](https://img.shields.io/badge/Platform-Windows_%7C_Linux_%7C_Mac-blue?logo=windows)
![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom_Node_Suite-orange?logo=python)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![i18n](https://img.shields.io/badge/Language-English_%7C_한국어-brightgreen)

**ComfyUI 워크플로우 제작 생산성을 극대화하는 올인원 QoL, 스마트 프리셋, 자동 모델 매칭 및 리저널 프롬프트 스위트**

[🇺🇸 English Documentation (README.md)](README.md) | [한국어 설명서](#-4대-핵심-모듈-및-기능)

</div>

---

## 🌟 4대 핵심 모듈 및 기능

`ComfyUI-Bada-Utils`는 파편화되어 있던 4개의 핵심 커스텀 노드를 단 하나의 강력한 패키지로 통합한 종합 스위트입니다.

```
🌊 ComfyUI-Bada-Utils
├── 📂 1. 워크플로우 & 편의(QoL) 도구  (사이드바 폴더 이동, 빈 캔버스 시작, 마우스 패닝/줌 보정)
├── 🌟 2. 유니버셜 스마트 프리셋 허브 (선 연결 없는 무선 파라미터 일괄 저장/복원)
├── ⚡ 3. 자동 모델 & LoRA 매칭 도우미  (워크플로우 로드 시 미설치 모델 자동 감지 및 스마트 장착)
└── 📐 4. 비주얼 그리드 리저널 프롬프트  (대화형 격자 분할 및 멀티 패널 공간 구도 프롬프트 생성)
```

---

### 1. 📂 워크플로우 & QoL 편의 기능
* **사이드바 워크플로우 폴더 정리**: 왼쪽 사이드바에서 워크플로우 JSON 파일을 마우스 드래그 앤 드롭으로 다른 폴더로 자유롭게 이동 및 새 폴더 생성.
* **클린 빈 캔버스 시작**: ComfyUI 실행 시 모델이 없어 빨간 에러가 뜨는 기본 워크플로우 대신 깨끗한 빈 캔버스로 시작.
* **전역 마우스 휠 줌 & 중간 버튼 패닝 보정**: 노드 위나 긴 텍스트 박스 위에서도 마우스 휠 줌 및 휠 클릭 화면 이동이 멈추지 않고 매끄럽게 작동.
* **유용한 기본 노드 제공**:
  - `🌊 Bada Show Text`: 텍스트 및 결과값을 캔버스 상에 직접 보여주는 인스펙터 노드.
  - `🌊 Bada Any Switch`: 이미지, 모델, 텍스트 등 모든 타입을 조건에 따라 스위칭해주는 만능 라우터.
  - `🌊 Bada Note`: 캔버스 화면 이동을 방해하지 않는 깔끔한 마크다운 메모 노드.

---

### 2. 🌟 유니버셜 스마트 프리셋 허브 (`BadaPresetHub`)
* **선 연결 없는 무선 일괄 컨트롤러**: 모델, LoRA, 샘플러 설정, CLIP, VAE, 디노이즈 값 등 전체 노드 세팅을 하나의 프리셋으로 묶어 원클릭 저장/적용.
* **워크플로우 & 이미지 자동 동봉**: 저장된 프리셋은 워크플로우 파일 및 생성된 이미지 메타데이터에 자동 내장되어 언제든 공유/복원 가능.
* **세련된 글래스모피즘 관리 드로어**: 드래그 앤 드롭으로 프리셋 순서 변경 및 수정/삭제 지원.

---

### 3. ⚡ 자동 모델 & LoRA 스마트 매칭 (`Auto Assigner`)
* **스마트 워크플로우 스캐너**: 외부 워크플로우를 불러올 때 내 컴퓨터에 없는 체크포인트, UNet, CLIP, VAE, LoRA를 실시간 자동 감지.
* **스마트 퍼지 매칭**: 내 로컬에 설치된 모델 목록과 자동 비교하여 가장 유사한 모델을 추천.
* **원클릭 일괄 교체**: 버튼 한 번으로 워크플로우 내 모든 노드의 모델 선택을 일괄 교체 및 장착.

---

### 4. 📐 비주얼 그리드 리저널 프롬프트 Pro (`BadaRegionalPrompt`)
* **마우스 드래그 영역 분할**: 캔버스 격자 위에서 마우스를 대각선으로 드래그하여 고유 네온 컬러의 사각형 영역(Area)을 즉시 생성.
* **10대 캐릭터 시트 샷 분류기**: 얼굴 클로즈업, 전신 턴어라운드, 상반신, 손, 발 등 캐릭터 시트에 특화된 프리셋 제공.
* **다중 AI 포맷 완벽 출력**:
  1. *Natural Spatial*: Krea 2, MiniMax, Gemini, Flux, GPT-4o 최적화.
  2. *ComfyUI / SD Regional Prompt (BREAK 문법)*.
  3. *Structured Tags* (`[Area 1 | LEFT (50% W, 100% H)]`).
  4. *Coordinates Bounding Box* (`<area_1 bbox="...">`).
  5. *Raw JSON*.

---

## ⚙️ ComfyUI 설정(Settings) 메뉴 연동

ComfyUI 우측 상단 톱니바퀴(`⚙️`) 설정 창에서 원하는 옵션을 자유롭게 켜고 끌 수 있습니다:
* **UI 언어**: `English` / `한국어` 실시간 전환.
* **시작 시 빈 캔버스 유지**: On / Off.
* **부드러운 마우스 패닝/줌 보정**: On / Off.
* **자동 모델 매칭 알림창**: On / Off.
* **사이드바 폴더 이동 편의기능**: On / Off.

---

## 🚀 설치 방법 (Installation)

### 방법 1: ComfyUI Manager 이용 (추천)
ComfyUI Manager 검색창에 `ComfyUI-Bada-Utils`를 검색 후 **Install** 클릭.

### 방법 2: Git Clone 이용
ComfyUI의 `custom_nodes/` 폴더 안에서 터미널을 열고 아래 명령어를 실행합니다:
```bash
cd custom_nodes
git clone https://github.com/bada-ya/ComfyUI-Bada-Utils.git
```
설치 후 ComfyUI를 재시작하시면 됩니다.

---

## 🛡️ 100% 이전 워크플로우 하위 호환성 보장
기존의 `UniversalPresetHub`, `VisualGridPromptNode`, `VisualGridPrompt`, `QoL_*` 노드로 제작된 모든 과거 워크플로우는 **자동 클래스 별칭(Alias) 매핑**을 통해 빨간 노드 에러 없이 100% 완벽하게 열립니다.

---

## 📄 라이선스 (License)
MIT License 에 따라 자유롭게 사용 및 수정이 가능합니다.
