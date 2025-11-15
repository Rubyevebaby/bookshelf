# GitHub Pages 배포 전략 문서

## 개요

이 문서는 Bookshelf 웹 애플리케이션을 GitHub Pages로 배포하기 위한 전략을 설명합니다. localhost에서는 모든 기능(읽기/쓰기)을 유지하면서, GitHub Pages에서는 정적 페이지로 읽기 전용 모드를 제공합니다.

## 요구사항

1. **localhost**: 모든 기능 유지 (Flask 백엔드 + 프론트엔드)
2. **GitHub Pages**: 정적 페이지만 배포 (읽기 전용)
3. **자동 동기화**: localhost에서 프론트엔드 업데이트 시 GitHub Pages도 자동 반영

## 아키텍처

### 환경별 데이터 소스

```
localhost (Flask 서버)
├── API 엔드포인트 사용 (/api/books, /api/stats 등)
├── 읽기/쓰기 가능
└── 이미지 업로드 가능

GitHub Pages (정적 사이트)
├── 정적 JSON 파일 사용 (static/data/*.json)
├── 읽기 전용
└── 클라이언트 사이드 필터링/정렬
```

## 구현 단계

### Phase 1: 환경 감지 및 분기 시스템

#### 1.1 config.js 생성

**파일 위치**: `static/config.js`

```javascript
// 환경 감지 및 설정
const STATIC_MODE = window.location.hostname !== 'localhost' && 
                    window.location.hostname !== '127.0.0.1' &&
                    window.location.hostname !== '';

// API URL 헬퍼 함수
function getApiUrl(endpoint) {
    if (STATIC_MODE) {
        // 정적 모드: JSON 파일 경로 반환
        return `/static/data/${endpoint.replace('api/', '').replace('/', '-')}.json`;
    } else {
        // Flask 모드: API 엔드포인트 반환
        return `/${endpoint}`;
    }
}

// 정적 데이터 파일 경로 매핑
const STATIC_DATA_MAP = {
    'api/books': 'static/data/books.json',
    'api/stats': 'static/data/stats.json',
    'api/books/current-year': 'static/data/books.json', // 클라이언트에서 필터링
    'api/year-end-summary': 'static/data/summary.json'
};
```

#### 1.2 script.js 수정

**주요 변경사항**:
- 모든 `fetch('/api/...')` 호출을 `fetch(getApiUrl('api/...'))`로 변경
- 정적 모드일 때 JSON 파일 직접 로드
- 정적 모드일 때 클라이언트 사이드 필터링/정렬 구현

**수정 예시**:
```javascript
// 기존
const response = await fetch('/api/books');

// 변경 후
const response = await fetch(getApiUrl('api/books'));
```

### Phase 2: 정적 데이터 로더 구현

#### 2.1 data-loader.js 생성

**파일 위치**: `static/data-loader.js`

**기능**:
- 정적 JSON 파일 로드
- 클라이언트 사이드 필터링
- 클라이언트 사이드 정렬
- 통계 계산 (올해 읽은 책 수 등)

**구현 예시**:
```javascript
// 정적 모드에서 책 데이터 로드
async function loadStaticBooks() {
    try {
        const response = await fetch('/static/data/books.json');
        const books = await response.json();
        return books;
    } catch (error) {
        console.error('Error loading static books:', error);
        return [];
    }
}

// 클라이언트 사이드 필터링 및 정렬
function filterAndSortBooks(books, search, category, sort, order) {
    let filtered = [...books];
    
    // 필터링 로직
    if (category) {
        filtered = filtered.filter(b => b.category === category);
    }
    
    if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(b => 
            (b.title || '').toLowerCase().includes(searchLower) ||
            (b.author || '').toLowerCase().includes(searchLower) ||
            (b.description || '').toLowerCase().includes(searchLower) ||
            (b.review || '').toLowerCase().includes(searchLower)
        );
    }
    
    // 정렬 로직
    // ... (구현 필요)
    
    return filtered;
}
```

#### 2.2 통계 계산

**구현 내용**:
- 현재 날짜 표시 (클라이언트에서 계산)
- 올해 읽은 책 수 계산 (read_date 필드 기반)
- 정적 모드에서는 클라이언트에서 계산

### Phase 3: Export 기능 구현

#### 3.1 Flask Export 엔드포인트 추가

**파일**: `app.py`

**새로운 엔드포인트**:
```python
@app.route('/api/export-static', methods=['POST'])
def export_static_data():
    """Export all data to static JSON files for GitHub Pages"""
    try:
        # Load books from CSV
        books = load_books()
        
        # Remove internal fields
        books_clean = []
        for book in books:
            book_copy = book.copy()
            book_copy.pop('_index', None)
            books_clean.append(book_copy)
        
        # Save to static/data/books.json
        os.makedirs('static/data', exist_ok=True)
        with open('static/data/books.json', 'w', encoding='utf-8') as f:
            json.dump(books_clean, f, ensure_ascii=False, indent=2)
        
        # Export stats
        current_year_count = get_current_year_count(books)
        current_date = datetime.now().strftime('%Y년 %m월 %d일')
        stats = {
            'current_date': current_date,
            'current_year_count': current_year_count
        }
        with open('static/data/stats.json', 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        
        # Export year-end summary
        summary = load_summary()
        with open('static/data/summary.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True, 'message': 'Static data exported successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
```

#### 3.2 Export 버튼 추가 (선택사항)

**위치**: localhost에서만 표시되는 관리자 버튼

**기능**: 
- 클릭 시 `/api/export-static` 호출
- 성공 시 알림 표시
- Git commit & push 안내 (수동 또는 자동화)

### Phase 4: UI 개선

#### 4.1 읽기 전용 모드 표시

**구현 내용**:
- 정적 모드일 때 상단에 읽기 전용 배너 표시
- "Add New Book" 버튼 숨김 또는 비활성화
- Edit 버튼 숨김 또는 비활성화
- 연말 결산 저장 버튼 숨김 또는 비활성화

**CSS 추가**:
```css
.read-only-banner {
    background: rgba(255, 193, 7, 0.2);
    border: 1px solid rgba(255, 193, 7, 0.5);
    padding: 15px;
    border-radius: 10px;
    margin-bottom: 20px;
    text-align: center;
    color: #ffc107;
}
```

#### 4.2 정적 모드 감지 및 UI 업데이트

**구현 위치**: `script.js`의 `DOMContentLoaded` 이벤트

```javascript
// 정적 모드일 때 UI 업데이트
if (STATIC_MODE) {
    // 읽기 전용 배너 표시
    showReadOnlyBanner();
    
    // 쓰기 기능 비활성화
    disableWriteFeatures();
}
```

### Phase 5: 정적 데이터 파일 구조

#### 5.1 books.json 구조

```json
[
    {
        "title": "책 제목",
        "author": "저자",
        "category": "스리픽",
        "read_date": "2025-01-01",
        "description": "설명",
        "rating": 4.5,
        "review": "한줄평",
        "cover_image": "/static/uploads/..."
    },
    ...
]
```

#### 5.2 stats.json 구조

```json
{
    "current_date": "2025년 1월 15일",
    "current_year_count": 50
}
```

#### 5.3 summary.json 구조

```json
{
    "enjoyable": [
        {
            "index": 10,
            "reason": "뽑힌 이유"
        },
        ...
    ],
    "difficult": [...],
    "best": {
        "sripeak": {"index": 5, "reason": "..."},
        "bookclub": {"index": 8, "reason": "..."},
        "milli": {"index": 12, "reason": "..."}
    }
}
```

## 파일 구조

```
bookshelf_test/
├── app.py                          # Flask 백엔드 (localhost 전용)
├── sri_books_2025.csv              # 원본 데이터
├── year_end_summary.json           # 연말 결산 데이터
├── static/
│   ├── config.js                  # [NEW] 환경 감지 및 설정
│   ├── data-loader.js             # [NEW] 정적 데이터 로더
│   ├── script.js                  # [MODIFY] 환경 분기 로직 추가
│   ├── style.css                  # [MODIFY] 읽기 전용 스타일 추가
│   ├── data/                      # [NEW] 정적 데이터 폴더
│   │   ├── books.json             # [GENERATED] 책 데이터
│   │   ├── stats.json             # [GENERATED] 통계 데이터
│   │   └── summary.json           # [GENERATED] 연말 결산 데이터
│   └── uploads/                    # 이미지 업로드 폴더
├── templates/
│   └── index.html                 # [MODIFY] config.js, data-loader.js 추가
└── DEPLOYMENT_STRATEGY.md         # 이 문서
```

## 배포 워크플로우

### 초기 설정

1. **정적 데이터 폴더 생성**
   ```bash
   mkdir -p static/data
   ```

2. **초기 데이터 Export**
   - localhost에서 Flask 서버 실행
   - `/api/export-static` 엔드포인트 호출 (또는 버튼 클릭)
   - `static/data/*.json` 파일 생성 확인

### 정기적인 업데이트 프로세스

1. **localhost에서 데이터 수정**
   - 책 추가/수정
   - 연말 결산 업데이트

2. **정적 데이터 Export**
   - Export 버튼 클릭 또는 API 호출
   - `static/data/*.json` 파일 업데이트

3. **Git 커밋 및 푸시**
   ```bash
   git add static/data/*.json
   git commit -m "Update static data"
   git push
   ```

4. **GitHub Pages 자동 배포**
   - GitHub Actions 또는 수동 배포
   - 변경사항 자동 반영

## 구현 체크리스트

### Phase 1: 환경 감지
- [ ] `static/config.js` 생성
- [ ] `STATIC_MODE` 변수 정의
- [ ] `getApiUrl()` 함수 구현
- [ ] `templates/index.html`에 `config.js` 추가

### Phase 2: 정적 데이터 로더
- [ ] `static/data-loader.js` 생성
- [ ] `loadStaticBooks()` 함수 구현
- [ ] `loadStaticStats()` 함수 구현
- [ ] `loadStaticSummary()` 함수 구현
- [ ] 클라이언트 사이드 필터링 함수 구현
- [ ] 클라이언트 사이드 정렬 함수 구현
- [ ] `templates/index.html`에 `data-loader.js` 추가

### Phase 3: script.js 수정
- [ ] 모든 API 호출을 `getApiUrl()` 사용하도록 변경
- [ ] `loadBooks()` 함수에 정적 모드 분기 추가
- [ ] `loadStats()` 함수에 정적 모드 분기 추가
- [ ] `loadYearEndSummary()` 함수에 정적 모드 분기 추가
- [ ] `initializeYearEndSummary()` 함수에 정적 모드 분기 추가
- [ ] 정적 모드일 때 쓰기 기능 비활성화

### Phase 4: Export 기능
- [ ] `app.py`에 `/api/export-static` 엔드포인트 추가
- [ ] CSV → JSON 변환 로직 구현
- [ ] 통계 계산 및 저장
- [ ] 연말 결산 데이터 저장
- [ ] (선택) Export 버튼 UI 추가

### Phase 5: UI 개선
- [ ] 읽기 전용 배너 컴포넌트 추가
- [ ] 정적 모드 감지 및 배너 표시
- [ ] 쓰기 기능 버튼 숨김/비활성화
- [ ] 읽기 전용 스타일 추가

### Phase 6: 테스트
- [ ] localhost에서 모든 기능 정상 작동 확인
- [ ] 정적 모드에서 읽기 기능 정상 작동 확인
- [ ] Export 기능 테스트
- [ ] GitHub Pages 배포 테스트

## 주의사항

### 이미지 처리
- **문제**: GitHub Pages에서는 이미지 업로드 불가
- **해결**: 
  - 이미지는 `static/uploads/` 폴더에 저장
  - 상대 경로로 참조 (`/static/uploads/filename.jpg`)
  - GitHub에 이미지 파일도 함께 커밋 필요

### CORS 문제
- **문제**: 정적 파일 로드는 CORS 문제 없음
- **확인**: 모든 정적 파일이 같은 도메인에서 제공되는지 확인

### 데이터 동기화
- **주의**: GitHub Pages는 수동 export 필요
- **권장**: 
  - 데이터 변경 후 항상 export 실행
  - Git commit 전 export 확인
  - (선택) GitHub Actions로 자동화

## 추가 개선 사항 (선택)

### GitHub Actions 자동화
- CSV 파일 변경 감지
- 자동으로 JSON 생성
- 자동 배포

### 실시간 동기화
- WebSocket 또는 Server-Sent Events
- (복잡도 높음, 권장하지 않음)

### CDN 활용
- 이미지 CDN 사용
- 정적 파일 CDN 캐싱

## 참고사항

- GitHub Pages는 정적 사이트만 지원
- 백엔드 API는 localhost에서만 작동
- 데이터 업데이트는 수동 export 필요
- 이미지는 Git 저장소에 포함되어야 함

