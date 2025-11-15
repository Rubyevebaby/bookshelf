function getStaticBasePath() {
    let basePath = window.BASE_PATH || (typeof BASE_PATH !== 'undefined' ? BASE_PATH : '');
    if (!basePath) {
        const path = window.location.pathname;
        if (path !== '/' && path !== '') {
            const parts = path.split('/').filter(p => p);
            if (parts.length > 0) {
                basePath = `/${parts[0]}/`;
            }
        }
    }
    return basePath;
}

// 정적 모드에서 책 데이터 로드
async function loadStaticBooks() {
    const basePath = getStaticBasePath();
    const csvUrl = `${basePath}static/data/books.csv`;
    
    // 1) CSV를 우선 시도 (스프레드시트 편집본 반영)
    try {
        console.log('Loading books from CSV:', csvUrl);
        const response = await fetch(csvUrl);
        if (response.ok) {
            const csvText = await response.text();
            const booksFromCsv = parseBooksCsv(csvText);
            if (booksFromCsv.length > 0) {
                return booksFromCsv;
            }
        } else {
            console.warn('CSV fetch failed with status:', response.status);
        }
    } catch (error) {
        console.warn('Error loading books from CSV:', error);
    }
    
    // 2) CSV가 없거나 비어 있으면 기존 JSON 로직으로 폴백
    try {
        const url = `${basePath}static/data/books.json`;
        console.log('Loading books from JSON:', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (Array.isArray(data)) {
            return data.map((book, index) => normalizeBookEntry(book, index));
        }
        
        if (data && typeof data === 'object' && 'books' in data) {
            return (data.books || []).map((book, index) => normalizeBookEntry(book, index));
        }
    } catch (error) {
        console.error('Error loading static books:', error);
    }
    
    return [];
}

function normalizeBookEntry(book, index) {
    if (book && typeof book === 'object') {
        return {
            ...book,
            _index: book._index !== undefined ? book._index : index,
            read_date: normalizeReadDateValue(book.read_date)
        };
    }
    return book;
}

function parseBooksCsv(csvText) {
    if (!csvText) return [];
    const normalizedText = csvText.replace(/^\uFEFF/, '');
    const lines = normalizedText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length <= 1) return [];
    
    const headers = parseCsvLine(lines[0]).map(header => header.trim());
    const books = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        if (values.length === 1 && values[0] === '') continue;
        
        const book = {};
        headers.forEach((header, idx) => {
            book[header] = values[idx] !== undefined ? values[idx].trim() : '';
        });
        book._index = books.length;
        book.read_date = normalizeReadDateValue(book.read_date);
        books.push(book);
    }
    return books;
}

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// 정적 모드에서 통계 데이터 로드
async function loadStaticStats() {
    const basePath = getStaticBasePath();
    const formattedDate = getTodayFormattedDate();
    let stats = {
        current_date: formattedDate,
        current_year_count: 0
    };
    
    try {
        const url = `${basePath}static/data/stats.json`;
        console.log('Loading stats from:', url);
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (typeof data.current_year_count === 'number') {
                stats.current_year_count = data.current_year_count;
            }
        } else {
            console.warn('Stats fetch failed with status:', response.status);
        }
    } catch (error) {
        console.error('Error loading static stats:', error);
    }
    
    return stats;
}

// 정적 모드에서 연말 결산 데이터 로드
async function loadStaticSummary() {
    try {
        const basePath = getStaticBasePath();
        const url = `${basePath}static/data/summary.json`;
        console.log('Loading summary from:', url);
        const response = await fetch(url);
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
    const formattedDate = getTodayFormattedDate();
    
    // books.json에서 올해 읽은 책 수 계산
    // 이 함수는 loadStaticBooks() 후에 호출되어야 함
    return {
        current_date: formattedDate,
        current_year_count: 0 // loadBooks에서 계산됨
    };
}

function getTodayFormattedDate() {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}년 ${String(currentDate.getMonth() + 1).padStart(2, '0')}월 ${String(currentDate.getDate()).padStart(2, '0')}일`;
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

function normalizeReadDateValue(dateString) {
    if (!dateString) return '';
    const trimmed = dateString.toString().trim();
    if (trimmed === '') return '';
    
    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return trimmed;
    }
    
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
        let year = parseInt(slashMatch[3], 10);
        if (year < 100) {
            year += 2000;
        }
        const month = parseInt(slashMatch[1], 10);
        const day = parseInt(slashMatch[2], 10);
        return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    const koreanMatch = trimmed.match(/^(\d{4})\s*(\d{1,2})월/);
    if (koreanMatch) {
        const year = parseInt(koreanMatch[1], 10);
        const month = parseInt(koreanMatch[2], 10);
        return `${year}-${String(month).padStart(2, '0')}-01`;
    }
    
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    
    return trimmed;
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
