// 정적 모드에서 책 데이터 로드
async function loadStaticBooks() {
    try {
        const response = await fetch('/static/data/books.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // 배열인 경우 그대로 반환
        if (Array.isArray(data)) {
            return data;
        }
        
        // 객체인 경우 books 필드 확인
        if (data && typeof data === 'object' && 'books' in data) {
            return data.books || [];
        }
        
        // 그 외의 경우 빈 배열 반환
        return [];
    } catch (error) {
        console.error('Error loading static books:', error);
        return [];
    }
}

// 정적 모드에서 통계 데이터 로드
async function loadStaticStats() {
    try {
        const response = await fetch('/static/data/stats.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error loading static stats:', error);
        // 클라이언트에서 계산
        return calculateStatsFromBooks();
    }
}

// 정적 모드에서 연말 결산 데이터 로드
async function loadStaticSummary() {
    try {
        const response = await fetch('/static/data/summary.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const summary = await response.json();
        return summary;
    } catch (error) {
        console.error('Error loading static summary:', error);
        return {};
    }
}

// 클라이언트에서 통계 계산
function calculateStatsFromBooks() {
    const currentYear = new Date().getFullYear();
    const currentDate = new Date();
    const formattedDate = `${currentDate.getFullYear()}년 ${String(currentDate.getMonth() + 1).padStart(2, '0')}월 ${String(currentDate.getDate()).padStart(2, '0')}일`;
    
    // books.json에서 올해 읽은 책 수 계산
    // 이 함수는 loadStaticBooks() 후에 호출되어야 함
    return {
        current_date: formattedDate,
        current_year_count: 0 // loadBooks에서 계산됨
    };
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
    if (sort === 'read_date') {
        filtered.sort((a, b) => {
            const dateA = parseDate(a.read_date);
            const dateB = parseDate(b.read_date);
            return order === 'desc' ? dateB - dateA : dateA - dateB;
        });
    } else if (sort === 'rating') {
        filtered.sort((a, b) => {
            const ratingA = parseFloat(a.rating) || 0;
            const ratingB = parseFloat(b.rating) || 0;
            return order === 'desc' ? ratingB - ratingA : ratingA - ratingB;
        });
    } else if (sort === 'title') {
        filtered.sort((a, b) => {
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            if (order === 'desc') {
                return titleB.localeCompare(titleA);
            } else {
                return titleA.localeCompare(titleB);
            }
        });
    }
    
    return filtered;
}

// 날짜 파싱 헬퍼 함수
function parseDate(dateString) {
    if (!dateString) return new Date(1900, 0, 1);
    
    // ISO 형식 (YYYY-MM-DD)
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return new Date(dateString);
    }
    
    // 한국 형식 (2025 1월)
    const koreanMatch = dateString.match(/^(\d{4})\s*(\d{1,2})월/);
    if (koreanMatch) {
        return new Date(parseInt(koreanMatch[1]), parseInt(koreanMatch[2]) - 1, 1);
    }
    
    // 일반 Date 파싱 시도
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }
    
    return new Date(1900, 0, 1);
}

// 현재 연도 책 필터링
function filterCurrentYearBooks(books) {
    const currentYear = new Date().getFullYear();
    return books.filter(book => {
        if (!book.read_date) return false;
        
        const date = parseDate(book.read_date);
        return date.getFullYear() === currentYear;
    });
}

