// 환경 감지 및 설정
const STATIC_MODE = window.location.hostname !== 'localhost' && 
                    window.location.hostname !== '127.0.0.1' &&
                    window.location.hostname !== '';

// API URL 헬퍼 함수
function getApiUrl(endpoint) {
    if (STATIC_MODE) {
        // 정적 모드: JSON 파일 경로 반환
        const endpointMap = {
            'api/books': '/static/data/books.json',
            'api/stats': '/static/data/stats.json',
            'api/books/current-year': '/static/data/books.json', // 클라이언트에서 필터링
            'api/year-end-summary': '/static/data/summary.json'
        };
        
        // 매핑된 경로가 있으면 사용
        if (endpointMap[endpoint]) {
            return endpointMap[endpoint];
        }
        
        // 기본 변환 로직
        return `/static/data/${endpoint.replace('api/', '').replace('/', '-')}.json`;
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
    'api/year-end-summary': '/static/data/summary.json'
};

