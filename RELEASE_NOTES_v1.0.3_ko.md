# ComfyUI-Bada-Utils v1.0.3 — Impact Pack 호환성 수정

> ⚠️ **업데이트 후:** 브라우저에서 <kbd>Ctrl</kbd>+<kbd>F5</kbd>를 눌러주세요. 이번 릴리즈는
> 프론트엔드 파일 1개만 변경하고 서버 파일은 변경하지 않았으므로 ComfyUI 재시작은
> 필요 없습니다. Manager로 업데이트하신다면 **Restart** 버튼이면 충분합니다.
>
> 신규 노드나 기능은 없습니다. **ComfyUI-Impact-Pack**이 설치된 환경에서 워크플로우를
> 불러올 때 `findInputSlot is not a function` 오류가 발생하며 캔버스가 일부만 복원되던
> 호환성 문제 1건을 수정했습니다.

**🌐 언어:** [English](RELEASE_NOTES_v1.0.3.md) · [한국어](RELEASE_NOTES_v1.0.3_ko.md)

## 1. 변경 사항

### LoadImage 해결사가 더 이상 `LGraphNode.prototype.configure`를 가로채지 않습니다

클립보드 & LoadImage 자동 에러 해결사는 훅 2개를 사용하고 있었습니다. 그중 하나가
`LGraphNode.prototype.configure`를 감싸고 있었는데, 이 함수는 ComfyUI가 워크플로우를
복원하는 도중 — 즉 링크가 아직 재구성되는 시점에 — 호출됩니다.

Impact Pack은 같은 시점을 `onConnectionsChange`로 처리하는데, 노드의 입력 슬롯이 아직
만들어지기 전에 해당 코드가 실행될 수 있습니다. 여기에 `configure` 훅이 하나 더 끼어들면서
호출 순서가 밀려 Impact Pack이 다음과 같이 실패했습니다.

```
TypeError: this.findInputSlot is not a function
```

결과적으로 빨간 오류 토스트가 뜨고 워크플로우가 일부만 로드되었습니다.

이번 수정은 `configure` 훅을 완전히 제거하고, 실제로 LoadImage 위젯을 치료하는
`addWidget` 훅만 남겼습니다. Impact Pack이 설치된 환경에서도 실패하던 워크플로우가
정상적으로 로드되며, 해결사의 원래 동작은 그대로 유지됩니다.

- <kbd>Ctrl</kbd>+<kbd>V</kbd>로 붙여넣은 클립보드 이미지의 빨간 "invalid image" 테두리
- 위젯이 검증하지 못하는 `subfolder/name.png` 형태의 하위 경로

### 콘솔 디버그 로그 2줄 제거

`catch` 블록 안의 `console.debug` 호출 2개가 설정 조회 때마다 출력되고 있었습니다.
동작은 그대로이고 콘솔만 조용해졌습니다.

### 저장소 위생 (사용자에게는 보이지 않음)

개발자 전용 경로 2개를 git에서 무시하도록 추가해 실수로 커밋될 수 없게 했습니다.
`node.zip`(CNR 배포 산출물)과 `deprecate_version.py`(실제 Firebase 토큰이 필요한 일회성
스크립트)입니다. 둘 다 배포본에 포함된 적은 없습니다.

## 2. 업데이트 안내

- **ComfyUI Manager:** **Update** → **Restart** 후 <kbd>Ctrl</kbd>+<kbd>F5</kbd>.
- **Git Clone:** `git pull` 후 <kbd>Ctrl</kbd>+<kbd>F5</kbd>.
- `config.json`, 프리셋, 즐겨찾기, 제미나이 채팅 기록은 그대로 유지됩니다.
- 노드의 입력·출력·위젯 순서는 바뀌지 않았으므로 기존에 저장한 워크플로우는 그대로 동작합니다.
