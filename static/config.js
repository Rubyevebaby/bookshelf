// 환경 감지 및 설정
const STATIC_MODE = window.location.hostname !== 'localhost' && 
                    window.location.hostname !== '127.0.0.1' &&
                    window.location.hostname !== '';

// Base path 감지 (GitHub Pages의 경우 /bookshelf/ 같은 subdirectory)
function getBasePath() {
    const path = window.location.pathname;
    // /bookshelf/ 같은 subdirectory가 있는지 확인
    // 예: /bookshelf/ -> /bookshelf/
    // 예: /bookshelf -> /bookshelf/
    // 예: / -> (빈 문자열)
    if (path === '/' || path === '') {
        return '';
    }
    // pathname이 /bookshelf/ 또는 /bookshelf 같은 형태인지 확인
    const parts = path.split('/').filter(p => p);
    if (parts.length > 0) {
        // 첫 번째 경로가 있으면 base path로 사용
        return `/${parts[0]}/`;
    }
    return '';
}

const BASE_PATH = getBasePath();
// 전역 변수로도 설정 (다른 스크립트에서 접근 가능하도록)
window.BASE_PATH = BASE_PATH;
console.log('BASE_PATH detected:', BASE_PATH);

// API URL 헬퍼 함수
function getApiUrl(endpoint) {
    if (STATIC_MODE) {
        // 정적 모드: JSON 파일 경로 반환
        const endpointMap = {
            'api/books': `${BASE_PATH}static/data/books.json`,
            'api/stats': `${BASE_PATH}static/data/stats.json`,
            'api/books/current-year': `${BASE_PATH}static/data/books.json`, // 클라이언트에서 필터링
            'api/year-end-summary': `${BASE_PATH}static/data/summary.json`,
            'api/feed': `${BASE_PATH}static/data/feed.json`
        };
        
        // 매핑된 경로가 있으면 사용
        if (endpointMap[endpoint]) {
            return endpointMap[endpoint];
        }
        
        // 기본 변환 로직
        return `${BASE_PATH}static/data/${endpoint.replace('api/', '').replace('/', '-')}.json`;
    } else {
        // Flask 모드: API 엔드포인트 반환
        return `/${endpoint}`;
    }
}

// 정적 데이터 파일 경로 매핑
const STATIC_DATA_MAP = {
    'api/books': '/static/data/books.json',
    'api/stats': '/static/data/stats.json',
    'api/books/current-year': '/static/data/books.json', // 클라이언트에서 필터링
    'api/year-end-summary': '/static/data/summary.json',
    'api/feed': '/static/data/feed.json'
};
