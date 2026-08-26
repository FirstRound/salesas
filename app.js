// --- 1. STATE MANAGEMENT & СИНХРОНИЗАЦИЯ БД ---
const SORTS = ['Альва', 'Амброзия', 'Гала', 'Лигол', 'Спартан', 'Космик Крисп'];
const NETWORKS = ['Перекресток', 'Вкусвилл', 'Магнит', 'Лента'];
const CLASSES = ['I класс', 'II класс', 'III класс', 'IV класс', 'V класс', 'VI класс (индустриальное)'];
const COLORS = ['super red', 'red', 'green', 'bicolour'];
const CALIBERS = ['<55 мм', '55-60 мм', '60-65 мм', '65-70 мм', '70-75 мм', '75-80 мм', '80+ мм'];
const PACKAGING = ['FP 2*1', 'FP 4*1', 'FP 6*1', 'Вес', 'Вес Бренд', 'Лоток 4*1', 'Лоток 4*1b', 'Пакет', 'Сетка'];

const MONTHS = ['Авг', 'Сен', 'Окт', 'Ноя', 'Дек', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл'];
const EXPENSES = ['Pre-harvest', 'Harvest', 'Логистика', 'Хранение', 'ФОТ Комм. отдела', 'Маркетинг'];

const EXP_DETAILED_COLS = [
    'EBITDA блок', 'Категория сорта', 'Объем, т', 'Выручка, млн', 'EBITDA тотал, млн', 
    'Цена без 6 класса', 'Объем бренд-упаковки', 'Доля бренд уп. от 1 кл.', 
    'Доля 1 класса (без 6)', 'Прехарвест', 'Риск', 'Харвест', 
    'Пост Харвест (тотал)', 'Хранение', 'Сорт/Упак', 'Упаковка', 'ФОТ Коммерции', 
    'Маркетинг', 'Логистика', 'Админ косты', 'EBITDA, %', 'Общая себестоимость'
];

const METRICS = [
    { id: 'vol', name: 'Объем продаж (т)', isPct: false },
    { id: 'rev', name: 'Валовая Выручка (₽)', isPct: false },
    { id: 'price', name: 'Ср. Цена реализации (₽/кг)', isPct: false },
    { id: 'exp', name: 'Аллоцированные расходы (₽)', isPct: false },
    { id: 'ebitda', name: 'EBITDA (₽)', isPct: false },
    { id: 'margin', name: 'Рентабельность по EBITDA (%)', isPct: true }
];

let scenarios = [
    { id: 's2025', name: '2025/2026', type: 'readonly', visible: true },
    { id: 'scur', name: '2026/2027', type: 'input', visible: true },
    { id: 's1', name: 'Сценарий 1', type: 'readonly', visible: true }
];

let tableData = {};
let finalPnlResults = [];

const API_BASE_URL = ''; 

const API = {
    async loadState() {
        try {
            let response = await fetch(`${API_BASE_URL}/api/v1/scenarios`);
            if (response.ok) {
                let data = await response.json();
                if (data && data.tableData && Object.keys(data.tableData).length > 0) return data;
            }
        } catch (e) { console.log('Не удалось загрузить данные из сети'); }
        let saved = localStorage.getItem('agronom_db_state');
        return saved ? JSON.parse(saved) : null;
    },
    async saveFullState(dataObj, scensObj, sortsArr) {
        localStorage.setItem('agronom_db_state', JSON.stringify({ tableData: dataObj, scenarios: scensObj, sorts: sortsArr }));
        try {
            let response = await fetch(`${API_BASE_URL}/api/v1/scenarios/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tableData: dataObj, scenarios: scensObj, sorts: sortsArr })
            });
            if (!response.ok) throw new Error('Ошибка сервера');
        } catch (e) {
            throw new Error('backend_offline');
        }
    }
};

// --- УТИЛИТЫ ФОРМАТИРОВАНИЯ И ИНТЕРФЕЙСА ---
function setSyncStatus(status, isError = false) {
    const ind = document.getElementById('sync-indicator');
    ind.className = 'sync-indicator';
    ind.title = status;
    if (isError) { ind.classList.add('error'); ind.innerHTML = '● Ошибка БД'; }
    else if (status === 'Сохранение...' || status === 'Создание сценария...' || status === 'Удаление...') {
        ind.classList.add('syncing'); ind.innerHTML = '⟳ ' + status;
    } else if (status === 'Подключение к БД...') { ind.innerHTML = '◌ Подключение...'; }
    else { ind.innerHTML = '✓ ' + status; }
}

let syncTimeout;
function autoSaveToBackend() {
    setSyncStatus('Сохранение...');
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        try {
            await API.saveFullState(tableData, scenarios, SORTS);
            setSyncStatus('Синхронизировано');
        } catch (e) {
            if (e.message === 'backend_offline') setSyncStatus('Локально (БД недоступна)', false);
            else setSyncStatus('Ошибка сохранения', true);
        }
    }, 600);
}

function isPercentKey(k) {
    if (!k) return false;
    let pcts = ['q_cls', 'q_col', 'q_call', 'q_calX', 'mix', 'p_net', 'p_pack', 'p_cls', 'p_cal'];
    if (pcts.some(p => k.includes(p))) return true;
    if (k.startsWith('vol_') && (k.includes('_3_') || k.includes('_6_'))) return true;
    if (k.startsWith('expdet_') && k.includes('_20_')) return true;
    return false;
}

function formatVal(val, isPercent = false) {
    if (val === undefined || val === null || val === '') return '';
    let num = parseFloat(val);
    if (isNaN(num) || num === 0) return isPercent ? '0%' : '0';
    
    if (isPercent) {
        // Округляем до 1 знака. JS автоматически уберет нули на конце (10.0 -> "10")
        let rounded = Math.round(num * 10) / 10;
        return rounded.toString().replace('.', ',') + '%';
    }
    
    // ЖЕСТКОЕ ОКРУГЛЕНИЕ АБСОЛЮТНЫХ ЗНАЧЕНИЙ ДО ЦЕЛОГО + НЕРАЗРЫВНЫЙ ПРОБЕЛ
    let rounded = Math.round(num);
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function formatInputDisplay(val, isPercent = false) {
    if (val === undefined || val === null || val === '') return '';
    let num = parseFloat(val);
    if (isNaN(num) || num === 0) return isPercent ? '0' : '0';
    
    if (isPercent) {
        let rounded = Math.round(num * 10) / 10;
        return rounded.toString().replace('.', ',');
    }
    
    let rounded = Math.round(num);
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

window.formatInputLive = function(el, isPercent) {
    let cursor = el.selectionStart;
    let oldLen = el.value.length;
    let isNegative = el.value.trim().startsWith('-');
    let raw = el.value.replace(/[^0-9.,\-]/g,'');
    if (isNegative) raw = '-' + raw.replace(/\-/g,'');
    else raw = raw.replace(/\-/g,'');
    raw = raw.replace('.', ',');
    let parts = raw.split(',');
    
    if (parts.length > 2) parts = [parts[0], parts.slice(1).join('')];
    
    // БЛОКИРОВКА: Если это абсолютное значение, запрещаем вводить дроби
    if (!isPercent && parts.length > 1) parts = [parts[0]];
    
    if (parts[0]){
        let numPart = parts[0].replace('-','');
        numPart = numPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
        parts[0] = (isNegative ? '-' : '') + numPart;
    }
    el.value = parts.join(',');
    
    let newLen = el.value.length;
    let newCursor = cursor + (newLen - oldLen);
    if(newCursor < 0) newCursor = 0;
    el.setSelectionRange(newCursor, newCursor);

    let key = el.getAttribute('data-key');
    let cleanStr = el.value.replace(/\s/g,'').replace(/\u00A0/g,'').replace(',', '.');
    let num = parseFloat(cleanStr);
    
    // Сохраняем в БД уже жестко округленное значение
    if (!isNaN(num)) {
        tableData[key] = isPercent ? (Math.round(num * 10) / 10) : Math.round(num);
    } else {
        tableData[key] = null;
    }

    if (key.startsWith('p_base') || key.startsWith('p_net') || key.startsWith('p_cls') || key.startsWith('p_cal') || key.startsWith('p_pack') || key.startsWith('q_cls') || key.startsWith('mix') || key.startsWith('q_call') || key.startsWith('q_calX')) {
        recalculateDependentTables();
    }
    autoSaveToBackend();
}

window.saveRawInput = function(el) {
    let key = el.getAttribute('data-key');
    let val = el.value;
    if (el.tagName === 'SELECT') {
        tableData[key] = val;
    } else {
        let cleanStr = val.replace(/\s/g,'').replace(/\u00A0/g,'').replace(',', '.').replace('%','');
        let num = parseFloat(cleanStr);
        if (!isNaN(num) && /^[0-9.,\-]+$/.test(cleanStr)) {
            let isPct = isPercentKey(key);
            num = isPct ? (Math.round(num * 10) / 10) : Math.round(num);
            tableData[key] = num;
            el.value = formatInputDisplay(num, isPct);
        } else {
            tableData[key] = val;
        }
    }
    autoSaveToBackend();
}

function parseVal(str) {
    if (!str || str.toString().trim() === '') return null;
    return parseFloat(str.toString().replace(/\s/g,'').replace(/\u00A0/g,'').replace(',', '.')) || 0;
}

window.switchTab = function(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    el.classList.add('active');
}

window.toggleAcc = function(el) { el.parentElement.classList.toggle('collapsed'); }
window.toggleSidebar = function() { document.getElementById('main-sidebar').classList.toggle('collapsed'); }

// --- ИНИЦИАЛИЗАЦИЯ И АВТО-ДОКТОР ---
document.addEventListener('DOMContentLoaded', async () => {
    setSyncStatus('Подключение к БД...');
    let cloudData = await API.loadState();
    if (cloudData) {
        tableData = cloudData.tableData || {};
        scenarios = cloudData.scenarios || scenarios;
        if (cloudData.sorts && Array.isArray(cloudData.sorts) && cloudData.sorts.length > 0) {
            SORTS.length = 0; SORTS.push(...cloudData.sorts);
        }
        if (tableData['_meta_networks'] && Array.isArray(tableData['_meta_networks'])) {
            NETWORKS.length = 0; NETWORKS.push(...tableData['_meta_networks']);
        }

        // АВТО-ДОКТОР: Лечим старые грязные данные в БД при загрузке
        let needSave = false;
        for (let k in tableData) {
            if (typeof tableData[k] === 'number') {
                let oldVal = tableData[k];
                if (isPercentKey(k)) {
                    tableData[k] = Math.round(tableData[k] * 10) / 10;
                } else {
                    tableData[k] = Math.round(tableData[k]);
                }
                if (oldVal !== tableData[k]) needSave = true;
            }
        }
        if (needSave) autoSaveToBackend();
    }
    
    renderCheckboxes();
    generateAllTables();
    initPnlControls();
    setSyncStatus(cloudData ? 'Синхронизировано' : 'Готово к работе');
});

// --- УПРАВЛЕНИЕ СЦЕНАРИЯМИ ---
window.toggleDropdown = function() { document.getElementById("scen-dropdown-list").classList.toggle("show"); }

window.onclick = function(event) {
    if (!event.target.closest('.scen-dropdown')) {
        let dropdowns = document.getElementsByClassName("scen-dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) dropdowns[i].classList.remove('show');
    }
    if (!event.target.closest('.multi-select')) {
        let multiDropdowns = document.getElementsByClassName("multi-select-content");
        for (let i = 0; i < multiDropdowns.length; i++) multiDropdowns[i].classList.remove('show');
    }
}

function renderCheckboxes() {
    let html = '';
    scenarios.forEach(scen => {
        let disabled = scen.id === 'scur' ? 'disabled' : '';
        let checked = scen.visible ? 'checked' : '';
        let delBtnHtml = (scen.id !== 'scur' && scen.id !== 's2025') 
            ? `<button class="btn-del-scen" onclick="deleteScenario('${scen.id}')" title="Удалить">✕</button>` 
            : '<span style="width: 24px;"></span>';
        html += `<div class="scen-item">
            <label><input type="checkbox" value="${scen.id}" onchange="toggleScenario(this)" ${checked} ${disabled}> ${scen.name}</label>
            ${delBtnHtml}
        </div>`;
    });
    document.getElementById('scen-dropdown-list').innerHTML = html;
}

window.toggleScenario = function(cb) {
    let scen = scenarios.find(s => s.id === cb.value);
    if(scen) scen.visible = cb.checked;
    generateAllTables();
    if (finalPnlResults.length > 0) renderPnlTable();
    autoSaveToBackend();
}

window.saveCurrentScenario = async function() {
    let name = prompt("Название нового зафиксированного сценария:", "Сценарий " + (scenarios.length - 1));
    if (!name) return;
    setSyncStatus('Создание сценария...');
    let newId = 's_' + Date.now();
    scenarios.push({ id: newId, name: name, type: 'readonly', visible: true });
    for (let key in tableData) {
        if (key.endsWith('_scur')) tableData[key.replace('_scur', '_' + newId)] = tableData[key];
    }
    autoSaveToBackend();
    renderCheckboxes();
    generateAllTables();
    if (finalPnlResults.length > 0) renderPnlTable();
}

window.deleteScenario = function(id) {
    if(!confirm("Вы уверены, что хотите безвозвратно удалить этот сценарий?")) return;
    setSyncStatus('Удаление...');
    scenarios = scenarios.filter(s => s.id !== id);
    for (let key in tableData) {
        if (key.endsWith('_' + id)) delete tableData[key];
    }
    autoSaveToBackend();
    renderCheckboxes();
    generateAllTables();
    if (finalPnlResults.length > 0) renderPnlTable();
}

// --- ГЕНЕРАТОРЫ БАЗОВЫХ ТАБЛИЦ ---
function getOrInitData(tableId, rIdx, cIdx, scenId, baseVal) {
    let key = `${tableId}_${rIdx}_${cIdx}_${scenId}`;
    if (tableData[key] !== undefined && tableData[key] !== null) return tableData[key];
    let val = baseVal;
    if (typeof baseVal === 'number') {
        if (scenId === 's2025') val = baseVal * 0.9;
        else if (scenId.startsWith('s_') || scenId === 's1') val = baseVal * 1.05;
    }
    tableData[key] = val;
    return val;
}

function buildInputs(tableId, rIdx, cIdx, baseVal, typeFlag) {
    let html = '';
    let isText = typeFlag === 'text';
    let isPct = typeFlag === true;
    
    scenarios.forEach(scen => {
        if (!scen.visible) return;
        let val = getOrInitData(tableId, rIdx, cIdx, scen.id, baseVal);
        let cellClass = `col-${scen.id} ${scen.id === 's2025' ? 'readonly-2025' : 'readonly-cell'}`;
        if (scen.type === 'input') {
            let key = `${tableId}_${rIdx}_${cIdx}_${scen.id}`;
            if (typeFlag === 'select_cat') {
                let acVal = val || 'inv';
                html += `<td class="col-${scen.id}">
                    <div class="input-wrapper">
                        <select data-key="${key}" onchange="saveRawInput(this)">
                            <option value="inv" ${acVal==='inv'?'selected':''}>inv</option>
                            <option value="core" ${acVal==='core'?'selected':''}>core</option>
                            <option value="com" ${acVal==='com'?'selected':''}>com</option>
                        </select>
                    </div>
                </td>`;
            } else if (typeFlag === 'select_orchard') {
                let acVal = val || 'инт';
                html += `<td class="col-${scen.id}">
                    <div class="input-wrapper">
                        <select data-key="${key}" onchange="saveRawInput(this)">
                            <option value="инт" ${acVal==='инт'?'selected':''}>инт</option>
                            <option value="экст" ${acVal==='экст'?'selected':''}>экст</option>
                        </select>
                    </div>
                </td>`;
            } else if (isText) {
                html += `<td class="col-${scen.id}">
                    <div class="input-wrapper">
                        <input type="text" data-key="${key}" value="${val || ''}" onchange="saveRawInput(this)">
                    </div>
                </td>`;
            } else {
                html += `<td class="col-${scen.id}">
                    <div class="input-wrapper">
                        <input type="text" data-key="${key}" value="${formatInputDisplay(val, isPct)}" oninput="formatInputLive(this, ${isPct})">
                    </div>
                </td>`;
            }
        } else {
            let finalDisplay = (typeFlag === 'text' || typeFlag.startsWith('select')) ? (val || '') : formatVal(val, isPct);
            html += `<td class="${cellClass}">${finalDisplay}</td>`;
        }
    });
    return html;
}

function buildTableMatrix(tableId, rowHeaders, colHeaders, dataGenerator, isPercentArr) {
    let visibleScens = scenarios.filter(s => s.visible);
    let subHeader = visibleScens.map(s => `<th class="col-${s.id}">${s.name}</th>`).join('');
    let thead = `<tr><th rowspan="2" class="sticky-col" style="left:0;">Параметр</th>${colHeaders.map(c => `<th colspan="${visibleScens.length}" class="group-th">${c}</th>`).join('')}</tr><tr>${subHeader.repeat(colHeaders.length)}</tr>`;
    let tbody = rowHeaders.map((rowHeader, rIdx) => {
        let rowName = typeof rowHeader === 'object' ? rowHeader.name : rowHeader;
        let isReadonlyRow = typeof rowHeader === 'object' && rowHeader.lock;
        let rowData = colHeaders.map((colHeader, cIdx) => {
            let typeFlag = Array.isArray(isPercentArr) ? isPercentArr[cIdx] : isPercentArr;
            
            let val = dataGenerator(rIdx, cIdx);
            if (typeFlag === 'select_cat') val = 'inv';
            if (typeFlag === 'select_orchard') val = 'инт';

            if (isReadonlyRow) {
                return visibleScens.map(scen => `<td class="col-${scen.id} readonly-cell">${(typeFlag==='text' || typeFlag.startsWith('select')) ? getOrInitData(tableId, rIdx, cIdx, scen.id, val) : formatVal(getOrInitData(tableId, rIdx, cIdx, scen.id, val), typeFlag===true)}</td>`).join('');
            }
            return buildInputs(tableId, rIdx, cIdx, val, typeFlag);
        }).join('');
        return `<tr><td class="sticky-col" style="left:0;">${rowName}</td>${rowData}</tr>`;
    }).join('');
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function buildMonthlyTableMatrix(tableId, rowHeaders, dataGenerator, isPercent) {
    let visibleScens = scenarios.filter(s => s.visible);
    let thead = `<tr>
        <th class="col-sticky-1">Параметр</th>
        <th class="col-sticky-2">Сценарий</th>
        ${MONTHS.map(m => `<th>${m}</th>`).join('')}
    </tr>`;
    let tbody = rowHeaders.map((rowHeader, rIdx) => {
        let rowName = typeof rowHeader === 'object' ? rowHeader.name : rowHeader;
        let isReadonlyRow = typeof rowHeader === 'object' && rowHeader.lock;
        return visibleScens.map((scen, scenIdx) => {
            let stickyCell1 = (scenIdx === 0) 
                ? `<td rowspan="${visibleScens.length}" class="col-sticky-1" style="vertical-align: middle;"><b>${rowName}</b></td>` 
                : '';
            let monthCells = MONTHS.map((_, mIdx) => {
                let val = getOrInitData(tableId, rIdx, mIdx, scen.id, dataGenerator(rIdx, mIdx));
                let cellClass = `col-${scen.id} ${scen.id === 's2025' ? 'readonly-2025' : 'readonly-cell'}`;
                if (scen.type === 'input' && !isReadonlyRow) {
                    let key = `${tableId}_${rIdx}_${mIdx}_${scen.id}`;
                    if (tableId === 'cap' || tableId === 'net_cap') {
                        return `<td class="col-${scen.id}">
                            <div class="input-wrapper">
                                <input type="text" data-key="${key}" value="${formatInputDisplay(val, false)}" placeholder="∞" onchange="saveRawInput(this)">
                            </div>
                        </td>`;
                    }
                    return `<td class="col-${scen.id}">
                        <div class="input-wrapper">
                            <input type="text" data-key="${key}" value="${formatInputDisplay(val, isPercent)}" oninput="formatInputLive(this, ${isPercent})">
                        </div>
                    </td>`;
                } else {
                    return `<td class="${cellClass}">${formatVal(val, isPercent)}</td>`;
                }
            }).join('');
            return `<tr>${stickyCell1}<td class="col-sticky-2 col-${scen.id}">${scen.name}</td>${monthCells}</tr>`;
        }).join('');
    }).join('');
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function buildMixTable(pIdx, packName) {
    let visibleScens = scenarios.filter(s => s.visible);
    let subHeader = visibleScens.map(s => `<th class="col-${s.id}">${s.name}</th>`).join('');
    let thead = `<tr><th rowspan="2" class="sticky-col" style="left:0;">Калибр</th><th colspan="${visibleScens.length}" class="group-th">${packName}</th></tr><tr>${subHeader}</tr>`;
    
    let tbody = CALIBERS.map((cal, cIdx) => {
        let rowData = visibleScens.map(scen => {
            let val = getOrInitData('mix', cIdx, pIdx, scen.id, 0);
            let cellClass = `col-${scen.id} ${scen.id === 's2025' ? 'readonly-2025' : 'readonly-cell'}`;
            
            if (scen.type === 'input') {
                let key = `mix_${cIdx}_${pIdx}_${scen.id}`;
                return `<td class="col-${scen.id}">
                    <div class="input-wrapper">
                        <input type="text" data-key="${key}" value="${formatInputDisplay(val, true)}" oninput="formatInputLive(this, true)">
                    </div>
                </td>`;
            } else {
                return `<td class="${cellClass}">${formatVal(val, true)}</td>`;
            }
        }).join('');
        return `<tr><td class="sticky-col" style="left:0;">${cal}</td>${rowData}</tr>`;
    }).join('');
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function buildMonthlyGraphTable() {
    window.systemCalculatedGraph = window.systemCalculatedGraph || {};
    let visibleScens = scenarios.filter(s => s.visible);
    let thead = `<tr>
        <th class="col-sticky-1">СОРТ</th>
        <th class="col-sticky-2">Сценарий</th>
        <th>Категория сорта</th>
        <th>Категория сада</th>
        ${MONTHS.map(m => `<th>${m}</th>`).join('')}
    </tr>`;

    let totalsHtml = visibleScens.map((scen, scenIdx) => {
        let stickyCell1 = (scenIdx === 0) 
            ? `<td rowspan="${visibleScens.length}" class="col-sticky-1">Итого (Валовый график)</td>` : '';
        
        let monthCells = MONTHS.map((month, mIdx) => {
            let mTotal = 0;
            SORTS.forEach((_, sIdx) => {
                let val = tableData[`grph_${sIdx}_${mIdx}_${scen.id}`];
                let hasOverride = (val !== undefined && val !== null && val !== '');
                let sysVal = (window.systemCalculatedGraph[scen.id] && window.systemCalculatedGraph[scen.id][sIdx]) 
                    ? window.systemCalculatedGraph[scen.id][sIdx][mIdx] : 0;
                
                mTotal += hasOverride ? Math.round(parseFloat(val)) : Math.round(sysVal);
            });
            return `<td>${formatVal(Math.round(mTotal), false)}</td>`;
        }).join('');
        return `<tr class="is-total">${stickyCell1}<td class="col-sticky-2">${scen.name}</td><td>-</td><td>-</td>${monthCells}</tr>`;
    }).join('');

    let tbody = totalsHtml + SORTS.map((sort, sIdx) => {
        return visibleScens.map((scen, scenIdx) => {
            let stickyCell1 = (scenIdx === 0) 
                ? `<td rowspan="${visibleScens.length}" class="col-sticky-1">${sort}</td>` : '';
            
            let catSort = tableData[`vol_${sIdx}_0_${scen.id}`] || 'inv';
            let catOrch = tableData[`vol_${sIdx}_1_${scen.id}`] || 'инт';
            let catCells = `<td class="readonly-cell" style="text-align:left;">${catSort}</td><td class="readonly-cell" style="text-align:left;">${catOrch}</td>`;

            let monthCells = MONTHS.map((month, mIdx) => {
                let key = `grph_${sIdx}_${mIdx}_${scen.id}`;
                let val = tableData[key];
                let hasOverride = (val !== undefined && val !== null && val !== '');
                
                let sysVal = (window.systemCalculatedGraph[scen.id] && window.systemCalculatedGraph[scen.id][sIdx]) 
                    ? window.systemCalculatedGraph[scen.id][sIdx][mIdx] : 0;
                
                sysVal = Math.round(sysVal);
                let finalVal = hasOverride ? Math.round(parseFloat(val)) : sysVal;
                
                if (scen.type === 'input') {
                    let displayVal = hasOverride ? formatInputDisplay(finalVal, false) : '';
                    return `<td>
                        <div class="input-wrapper">
                            <input type="text" data-key="${key}" value="${displayVal}" placeholder="${formatInputDisplay(sysVal, false)}" oninput="formatInputLive(this, false)">
                        </div>
                    </td>`;
                } else {
                    return `<td class="readonly-cell">${formatVal(finalVal, false)}</td>`;
                }
            }).join('');
            return `<tr>${stickyCell1}<td class="col-sticky-2">${scen.name}</td>${catCells}${monthCells}</tr>`;
        }).join('');
    }).join('');
    document.getElementById('tbl-graph').innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function buildPackCapTable() {
    let visibleScens = scenarios.filter(s => s.visible);
    let thead = `<tr>
        <th class="col-sticky-1">СОРТ</th>
        <th class="col-sticky-2">Упаковка</th>
        <th class="col-sticky-3">Сценарий</th>
        ${MONTHS.map(m => `<th>${m}</th>`).join('')}
    </tr>`;
    
    let tbody = SORTS.map((sort, sIdx) => {
        return PACKAGING.map((pack, pIdx) => {
            return visibleScens.map((scen, scenIdx) => {
                let stickyCell1 = (pIdx === 0 && scenIdx === 0)
                    ? `<td rowspan="${PACKAGING.length * visibleScens.length}" class="col-sticky-1" style="vertical-align: middle;"><b>${sort}</b></td>`
                    : '';
                let stickyCell2 = (scenIdx === 0)
                    ? `<td rowspan="${visibleScens.length}" class="col-sticky-2" style="vertical-align: middle;">${pack}</td>`
                    : '';
                
                let monthCells = MONTHS.map((month, mIdx) => {
                    let key = `pack_cap_${sIdx}_${pIdx}_${mIdx}_${scen.id}`;
                    let val = tableData[key];
                    let cellClass = `col-${scen.id} ${scen.id === 's2025' ? 'readonly-2025' : 'readonly-cell'}`;
                    
                    if (scen.type === 'input') {
                        let displayVal = (val !== undefined && val !== null && val !== '') ? formatInputDisplay(val, false) : '';
                        return `<td class="col-${scen.id}">
                            <div class="input-wrapper">
                                <input type="text" data-key="${key}" value="${displayVal}" placeholder="∞" onchange="saveRawInput(this)">
                            </div>
                        </td>`;
                    } else {
                        let finalDisplay = (val !== undefined && val !== null && val !== '') ? formatVal(val, false) : '';
                        return `<td class="${cellClass}">${finalDisplay}</td>`;
                    }
                }).join('');
                return `<tr>${stickyCell1}${stickyCell2}<td class="col-sticky-3 col-${scen.id}">${scen.name}</td>${monthCells}</tr>`;
            }).join('');
        }).join('');
    }).join('');
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

let currentDetCapPage = 1;
const DET_CAP_ITEMS_PER_PAGE = 50; 

function buildDetailedCapTable() {
    let visibleScens = scenarios.filter(s => s.visible);
    let thead = `<tr>
        <th class="col-sticky-1">СОРТ</th>
        <th class="col-sticky-2">Клиент</th>
        <th class="col-sticky-3">Упаковка</th>
        <th class="col-sticky-4">Сценарий</th>
        ${MONTHS.map(m => `<th>${m}</th>`).join('')}
    </tr>`;
    
    let allRows = [];
    SORTS.forEach((sort, sIdx) => {
        NETWORKS.forEach((net, nIdx) => {
            PACKAGING.forEach((pack, pIdx) => {
                allRows.push({ sort, sIdx, net, nIdx, pack, pIdx });
            });
        });
    });

    let totalPages = Math.ceil(allRows.length / DET_CAP_ITEMS_PER_PAGE) || 1;
    if (currentDetCapPage > totalPages) currentDetCapPage = totalPages;
    if (currentDetCapPage < 1) currentDetCapPage = 1;

    let startIdx = (currentDetCapPage - 1) * DET_CAP_ITEMS_PER_PAGE;
    let paginatedRows = allRows.slice(startIdx, startIdx + DET_CAP_ITEMS_PER_PAGE);

    let tbody = '';
    paginatedRows.forEach(row => {
        visibleScens.forEach((scen, scenIdx) => {
            let isFirstScen = scenIdx === 0;

            let stickyCell1 = isFirstScen ? `<td rowspan="${visibleScens.length}" class="col-sticky-1" style="vertical-align: middle;"><b>${row.sort}</b></td>` : '';
            let stickyCell2 = isFirstScen ? `<td rowspan="${visibleScens.length}" class="col-sticky-2" style="vertical-align: middle;">${row.net}</td>` : '';
            let stickyCell3 = isFirstScen ? `<td rowspan="${visibleScens.length}" class="col-sticky-3" style="vertical-align: middle;">${row.pack}</td>` : '';
            
            let monthCells = MONTHS.map((month, mIdx) => {
                let key = `det_cap_${row.sIdx}_${row.nIdx}_${row.pIdx}_${mIdx}_${scen.id}`;
                let val = tableData[key];
                let cellClass = `col-${scen.id} ${scen.id === 's2025' ? 'readonly-2025' : 'readonly-cell'}`;
                
                if (scen.type === 'input') {
                    let displayVal = (val !== undefined && val !== null && val !== '') ? formatInputDisplay(val, false) : '';
                    return `<td class="col-${scen.id}">
                        <div class="input-wrapper">
                            <input type="text" data-key="${key}" value="${displayVal}" placeholder="∞" onchange="saveRawInput(this)">
                        </div>
                    </td>`;
                } else {
                    let finalDisplay = (val !== undefined && val !== null && val !== '') ? formatVal(val, false) : '';
                    return `<td class="${cellClass}">${finalDisplay}</td>`;
                }
            }).join('');
            
            tbody += `<tr>${stickyCell1}${stickyCell2}${stickyCell3}<td class="col-sticky-4 col-${scen.id}">${scen.name}</td>${monthCells}</tr>`;
        });
    });

    if (tbody === '') tbody = '<tr><td colspan="20" style="text-align: center; padding: 20px;">Нет данных</td></tr>';

    let paginationControls = '';
    if (totalPages > 1) {
        paginationControls = `
        <div class="pagination">
            <button class="page-btn" onclick="changeDetCapPage(-1)" ${currentDetCapPage === 1 ? 'disabled' : ''}>← Назад</button>
            <span class="page-info">Страница ${currentDetCapPage} из ${totalPages}</span>
            <button class="page-btn" onclick="changeDetCapPage(1)" ${currentDetCapPage === totalPages ? 'disabled' : ''}>Вперед →</button>
        </div>`;
    }
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>` + paginationControls;
}

window.changeDetCapPage = function(delta) {
    currentDetCapPage += delta;
    document.getElementById('tbl-cap-det').innerHTML = buildDetailedCapTable();
}

function buildExpDetailedTable() {
    let visibleScens = scenarios.filter(s => s.visible);
    let thead = `<tr>
        <th class="col-sticky-1">СОРТ</th>
        <th class="col-sticky-2">Сценарий</th>
        ${EXP_DETAILED_COLS.map(c => `<th>${c}</th>`).join('')}
    </tr>`;

    let tbody = SORTS.map((sort, sIdx) => {
        return visibleScens.map((scen, scenIdx) => {
            let stickyCell1 = (scenIdx === 0) 
                ? `<td rowspan="${visibleScens.length}" class="col-sticky-1" style="vertical-align: middle;"><b>${sort}</b></td>` 
                : '';
            
            let cells = EXP_DETAILED_COLS.map((colName, cIdx) => {
                let key = `expdet_${sIdx}_${cIdx}_${scen.id}`;
                let val = tableData[key];
                let hasVal = (val !== undefined && val !== null && val !== '');
                let cellClass = `col-${scen.id} ${scen.id === 's2025' ? 'readonly-2025' : 'readonly-cell'}`;
                
                if (scen.type === 'input') {
                    let displayVal = hasVal ? (typeof val === 'number' ? formatInputDisplay(val, false) : val) : '';
                    return `<td class="col-${scen.id}">
                        <div class="input-wrapper">
                            <input type="text" data-key="${key}" value="${displayVal}" onchange="saveRawInput(this)">
                        </div>
                    </td>`;
                } else {
                    let displayVal = hasVal ? (typeof val === 'number' ? formatVal(val, false) : val) : '';
                    return `<td class="${cellClass}">${displayVal}</td>`;
                }
            }).join('');
            
            return `<tr>${stickyCell1}<td class="col-sticky-2 col-${scen.id}">${scen.name}</td>${cells}</tr>`;
        }).join('');
    }).join('');
    document.getElementById('tbl-exp-detailed').innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function getSt(keyPrefix, scenId) {
    let val = tableData[`${keyPrefix}_${scenId}`];
    return (val === null || val === undefined || val === '') ? 0 : val;
}

function getCalculatedAvgPrice(sIdx, scenId) {
    if (!scenId) scenId = 'scur';
    let basePrice = getSt(`p_base_${sIdx}_0`, scenId) || 0;
    
    let avgNetMod = 0;
    if (NETWORKS.length > 0) {
        NETWORKS.forEach((net, nIdx) => { avgNetMod += getSt(`p_net_${nIdx}_0`, scenId); });
        avgNetMod = (avgNetMod / NETWORKS.length) / 100;
    }
    
    let avgClsMod = 0;
    CLASSES.forEach((cls, cIdx) => { 
        avgClsMod += (getSt(`q_cls_${sIdx}_${cIdx}`, scenId) / 100) * (getSt(`p_cls_${cIdx}_0`, scenId) / 100); 
    });
    
    let avgCalMod = 0;
    CALIBERS.forEach((cal, cIdx) => { 
        let tablePref = (cIdx === 0) ? 'q_call' : 'q_calX';
        let pCal = getSt(`${tablePref}_${sIdx}_${cIdx}`, scenId) / 100;
        let calMod = getSt(`p_cal_${cIdx}_0`, scenId) / 100;
        avgCalMod += pCal * calMod; 
    });
    
    let avgPackMod = 0;
    PACKAGING.forEach((pack, pIdx) => {
        let pShare = 0;
        CALIBERS.forEach((c, cIdx) => { pShare += getSt(`mix_${cIdx}_${pIdx}`, scenId) / 100; });
        pShare /= (CALIBERS.length || 1);
        avgPackMod += pShare * (getSt(`p_pack_${pIdx}_0`, scenId) / 100);
    });
    
    return basePrice * (1 + avgNetMod + avgClsMod + avgCalMod + avgPackMod);
}

function buildMonthlyPriceTable() {
    let visibleScens = scenarios.filter(s => s.visible);
    let thead = `<tr>
        <th class="col-sticky-1">СОРТ</th>
        <th class="col-sticky-2">Сценарий</th>
        ${MONTHS.map(m => `<th>${m}</th>`).join('')}
    </tr>`;
    let tbody = SORTS.map((sort, sIdx) => {
        return visibleScens.map((scen, scenIdx) => {
            let stickyCell1 = (scenIdx === 0)
                ? `<td rowspan="${visibleScens.length}" class="col-sticky-1" style="vertical-align: middle;"><b>${sort}</b></td>`
                : '';
            let monthCells = MONTHS.map((month, mIdx) => {
                let key = `p_fin_${sIdx}_${mIdx}_${scen.id}`;
                let calcVal = getCalculatedAvgPrice(sIdx, scen.id);
                let hasOverride = (tableData[key] !== undefined && tableData[key] !== null && tableData[key] !== '');
                let cellClass = `col-${scen.id} ${scen.id === 's2025' ? 'readonly-2025' : 'readonly-cell'}`;
                if (scen.type === 'input') {
                    let displayVal = hasOverride ? formatInputDisplay(tableData[key], false) : '';
                    let placeholder = formatInputDisplay(calcVal, false);
                    return `<td class="col-${scen.id}">
                        <div class="input-wrapper">
                            <input type="text" data-key="${key}" value="${displayVal}" placeholder="${placeholder}" oninput="formatInputLive(this, false)">
                        </div>
                    </td>`;
                } else {
                    let finalDisplay = hasOverride ? tableData[key] : calcVal;
                    return `<td class="${cellClass}">${formatVal(finalDisplay, false)}</td>`;
                }
            }).join('');
            return `<tr>${stickyCell1}<td class="col-sticky-2 col-${scen.id}">${scen.name}</td>${monthCells}</tr>`;
        }).join('');
    }).join('');
    document.getElementById('tbl-prc-monthly').innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function recalculateCapacityTable() {
    document.getElementById('tbl-cap-sort').innerHTML = buildMonthlyTableMatrix('cap', SORTS, () => '', false);
    document.getElementById('tbl-cap-net').innerHTML = buildMonthlyTableMatrix('net_cap', NETWORKS, () => '', false);
    document.getElementById('tbl-cap-pack').innerHTML = buildPackCapTable();
    document.getElementById('tbl-cap-det').innerHTML = buildDetailedCapTable();
}

function recalculateDependentTables() {
    buildMonthlyPriceTable();
    if (typeof buildMonthlyGraphTable === 'function') {
        buildMonthlyGraphTable();
    }
}

window.generateAllTables = function() {
    document.getElementById('tbl-volumes').innerHTML = buildTableMatrix('vol', SORTS, ['Категория сорта', 'Категория сада', 'Валовый сбор (т)', 'Индустриальное (%)', 'На хранение (т)', 'Хранение РГС', 'Убыль и потери (%)'], () => 0, ['select_cat', 'select_orchard', false, true, false, 'text', true]);
    document.getElementById('tbl-qual-classes').innerHTML = buildTableMatrix('q_cls', SORTS, CLASSES, () => 0, true);
    document.getElementById('tbl-qual-colors').innerHTML = buildTableMatrix('q_col', SORTS, COLORS, () => 0, true);
    document.getElementById('tbl-qual-cal-1').innerHTML = buildTableMatrix('q_call', SORTS, CALIBERS, () => 0, true);
    document.getElementById('tbl-qual-cal-ext').innerHTML = buildTableMatrix('q_calX', SORTS, CALIBERS, () => 0, true);

    buildMonthlyGraphTable();
    
    let mixHtml = '';
    PACKAGING.forEach((pack, pIdx) => {
        mixHtml += `
        <div class="accordion">
            <div class="accordion-header" onclick="toggleAcc(this)">
                <h3>Упаковка: ${pack}</h3>
            </div>
            <div class="accordion-body table-container">
                ${buildMixTable(pIdx, pack)}
            </div>
        </div>`;
    });
    document.getElementById('mix-tables-container').innerHTML = mixHtml;
    document.getElementById('tbl-prc-base').innerHTML = buildTableMatrix('p_base', SORTS, ['Базовая цена (₽)'], () => 100, false);
    document.getElementById('tbl-prc-net').innerHTML = buildTableMatrix('p_net', NETWORKS, ['Премия/Скидка (%)'], () => 0, true);
    document.getElementById('tbl-prc-pack').innerHTML = buildTableMatrix('p_pack', PACKAGING, ['Надбавка (%)'], () => 0, true);
    document.getElementById('tbl-prc-cls').innerHTML = buildTableMatrix('p_cls', CLASSES, ['Скидка (%)'], () => 0, true);
    document.getElementById('tbl-prc-cal').innerHTML = buildTableMatrix('p_cal', CALIBERS, ['Скидка (%)'], () => 0, true);
    document.getElementById('tbl-expenses').innerHTML = buildTableMatrix('exp', EXPENSES, ['Бюджет (₽)'], () => 0, false);

    recalculateCapacityTable(); 
    buildExpDetailedTable();
    recalculateDependentTables();
}

// --- OLAP КОНТРОЛЛЕР И РЕНДЕРИНГ P&L ---
let pnlState = {
    sorts: [], nets: [], packs: [], cls: [], cal: [], months: [...MONTHS, 'ИТОГО'], metrics: ['vol', 'rev', 'ebitda'], page: 1
};
const ITEMS_PER_PAGE = 100; 

function initPnlControls() {
    pnlState.sorts = [...SORTS];
    pnlState.nets = [...NETWORKS];
    pnlState.packs = [...PACKAGING];
    pnlState.cls = [...CLASSES];
    pnlState.cal = [...CALIBERS];

    function buildMultiSelect(id, labelText, items, stateKey) {
        let html = `<button class="multi-select-btn" onclick="toggleMultiSelect(event, '${id}-content')">
            <span id="${id}-title">${labelText} (Все)</span> <span>▾</span>
        </button>
        <div class="multi-select-content" id="${id}-content">
            <label style="border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 4px; border-radius: 0;">
                <input type="checkbox" onchange="toggleAllFilter('${stateKey}', this, '${id}', '${labelText}')" checked> 
                <b style="color: var(--primary);">Выбрать все</b>
            </label>
            ${items.map(item => `<label><input type="checkbox" class="cb-${stateKey}" value="${item}" checked onchange="toggleFilterMulti('${stateKey}', this, '${id}', '${labelText}')"> ${item}</label>`).join('')}
        </div>`;
        document.getElementById(id).innerHTML = html;
    }

    buildMultiSelect('dd-sort', 'Сорта', SORTS, 'sorts');
    buildMultiSelect('dd-net', 'Сети', NETWORKS, 'nets');
    buildMultiSelect('dd-pack', 'Упаковка', PACKAGING, 'packs');
    buildMultiSelect('dd-cls', 'Классы', CLASSES, 'cls');
    buildMultiSelect('dd-cal', 'Калибры', CALIBERS, 'cal');

    let mHtml = MONTHS.map(m => `<label><input type="checkbox" value="${m}" checked onchange="toggleFilter('months', this)"> ${m}</label>`).join('');
    mHtml += `<label><input type="checkbox" value="ИТОГО" checked onchange="toggleFilter('months', this)"> ИТОГО</label>`;
    document.getElementById('toggles-months').innerHTML = mHtml;

    let metricHtml = METRICS.map(m => `<label><input type="checkbox" value="${m.id}" ${pnlState.metrics.includes(m.id)?'checked':''} onchange="toggleFilter('metrics', this)"> ${m.name}</label>`).join('');
    document.getElementById('toggles-metrics').innerHTML = metricHtml;
}

window.toggleMultiSelect = function(e, contentId) {
    e.stopPropagation();
    let current = document.getElementById(contentId);
    let isShowing = current.classList.contains('show');
    document.querySelectorAll('.multi-select-content').forEach(el => el.classList.remove('show'));
    if (!isShowing) current.classList.add('show');
}

window.toggleFilterMulti = function(type, cb, id, labelText) {
    if(cb.checked) {
        if(!pnlState[type].includes(cb.value)) pnlState[type].push(cb.value);
    } else {
        pnlState[type] = pnlState[type].filter(i => i !== cb.value);
    }
    updateMultiSelectTitle(id, labelText, type);
    pnlState.page = 1;
    if (Object.keys(finalPnlResults).length > 0) renderPnlTable();
}

window.toggleAllFilter = function(type, cb, id, labelText) {
    let checkboxes = document.querySelectorAll(`.cb-${type}`);
    pnlState[type] = [];
    checkboxes.forEach(c => {
        c.checked = cb.checked;
        if(cb.checked) pnlState[type].push(c.value);
    });
    updateMultiSelectTitle(id, labelText, type);
    pnlState.page = 1;
    if (Object.keys(finalPnlResults).length > 0) renderPnlTable();
}

function updateMultiSelectTitle(id, labelText, type) {
    let total = 0;
    if(type === 'sorts') total = SORTS.length;
    else if(type === 'nets') total = NETWORKS.length;
    else if(type === 'packs') total = PACKAGING.length;
    else if(type === 'cls') total = CLASSES.length;
    else if(type === 'cal') total = CALIBERS.length;

    let selected = pnlState[type].length;
    let titleEl = document.getElementById(`${id}-title`);
    if(selected === total) titleEl.innerHTML = `${labelText} (Все)`;
    else if(selected === 0) titleEl.innerHTML = `${labelText} (0)`;
    else titleEl.innerHTML = `${labelText} (${selected})`;
}

window.toggleFilter = function(type, cb) {
    if(cb.checked) pnlState[type].push(cb.value);
    else pnlState[type] = pnlState[type].filter(i => i !== cb.value);
    
    if(type === 'months') {
        let order = [...MONTHS, 'ИТОГО'];
        pnlState.months.sort((a,b) => order.indexOf(a) - order.indexOf(b));
    } else if (type === 'metrics') {
        let order = METRICS.map(m => m.id);
        pnlState.metrics.sort((a,b) => order.indexOf(a) - order.indexOf(b));
    }
    pnlState.page = 1;
    if (Object.keys(finalPnlResults).length > 0) renderPnlTable();
}

window.changePage = function(delta) { pnlState.page += delta; renderPnlTable(); }

function aggregateScenarios(rows, visibleScens) {
    let res = {};
    visibleScens.forEach(scen => {
        res[scen.id] = {};
        MONTHS.forEach(m => res[scen.id][m] = {vol:0, rev:0, exp:0});
    });
    rows.forEach(r => {
        visibleScens.forEach(scen => {
            let d = r.scenarios[scen.id] || {};
            MONTHS.forEach(m => {
                if(d[m]) {
                    res[scen.id][m].vol += d[m].vol || 0;
                    res[scen.id][m].rev += d[m].rev || 0;
                    res[scen.id][m].exp += d[m].exp || 0;
                }
            });
        });
    });
    return res;
}

function getLeaves(node) {
    if (node._isLeaf) return node.items;
    let leaves = [];
    for(let k in node) { if(k !== '_isLeaf') leaves.push(...getLeaves(node[k])); }
    return leaves;
}

function buildPivotTree(data, groups) {
    if (groups.length === 0) return { _isLeaf: true, items: data };
    let gField = groups[0];
    let dict = {};
    data.forEach(r => {
        let val = r[gField] || 'Прочее';
        if(!dict[val]) dict[val] = [];
        dict[val].push(r);
    });
    let result = {};
    for(let k in dict) result[k] = buildPivotTree(dict[k], groups.slice(1));
    return result;
}

window.renderPnlTable = function() {
    let visibleScens = scenarios.filter(s => s.visible);
    if(pnlState.months.length === 0 || pnlState.metrics.length === 0 || visibleScens.length === 0) {
        document.getElementById('tbl-results-container').innerHTML = '<table><tbody><tr><td style="text-align:center; padding:50px;">Выделите хотя бы один срез, месяц и метрику</td></tr></tbody></table>';
        return;
    }

    let filteredData = finalPnlResults.filter(r => 
        pnlState.sorts.includes(r.sort) && 
        pnlState.nets.includes(r.net) && 
        pnlState.packs.includes(r.pack) &&
        pnlState.cls.includes(r.cls) &&
        pnlState.cal.includes(r.cal)
    );

    if (filteredData.length === 0) {
        document.getElementById('tbl-results-container').innerHTML = '<table><tbody><tr><td style="text-align:center; padding:50px;">Нет данных по выбранным фильтрам</td></tr></tbody></table>';
        return;
    }

    let rawGroups = [
        document.getElementById('pivot-g1').value,
        document.getElementById('pivot-g2').value,
        document.getElementById('pivot-g3').value,
        document.getElementById('pivot-g4').value
    ];
    let groups = [...new Set(rawGroups.filter(g => g !== ''))];
    if (groups.length === 0) groups = ['net']; 

    let tree = buildPivotTree(filteredData, groups);
    let renderRows = [];

    function traverse(node, name, level) {
        let leaves = getLeaves(node);
        let agg = aggregateScenarios(leaves, visibleScens);
        renderRows.push({ name: name, level: level, scenarios: agg });
        
        if (!node._isLeaf) {
            let children = Object.keys(node).filter(k => k !== '_isLeaf').sort();
            children.forEach(childName => traverse(node[childName], childName, level + 1));
        }
    }

    traverse(tree, 'ИТОГО ПО ВЫБОРКЕ', 1);

    let totalPages = Math.ceil(renderRows.length / ITEMS_PER_PAGE) || 1;
    if (pnlState.page > totalPages) pnlState.page = totalPages;
    if (pnlState.page < 1) pnlState.page = 1;

    let startIdx = (pnlState.page - 1) * ITEMS_PER_PAGE;
    let paginatedRows = renderRows.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    let subHeader = visibleScens.map(s => `<th class="col-${s.id}">${s.name}</th>`).join('');
    let thead = `<tr><th rowspan="2" class="col-sticky-1">Структура данных</th><th rowspan="2" class="col-sticky-2">Показатель</th>`;
    pnlState.months.forEach(m => { thead += `<th colspan="${visibleScens.length}" class="group-th">${m}</th>`; });
    thead += `</tr><tr>${subHeader.repeat(pnlState.months.length)}</tr>`;

    let tbody = '';
    paginatedRows.forEach(row => {
        let indentClass = `pivot-level-${row.level}`;
        
        pnlState.metrics.forEach((mId, mIndex) => {
            let metricDef = METRICS.find(m => m.id === mId);
            let isFirstMetric = mIndex === 0;
            let tr = '<tr>';
            
            if (isFirstMetric) {
                tr += `<td rowspan="${pnlState.metrics.length}" class="col-sticky-1 ${indentClass}">${row.name}</td>`;
            }
            let sticky2Bg = row.level === 1 ? 'background:#e8ede8 !important; font-weight:700;' : '';
            tr += `<td class="col-sticky-2" style="${sticky2Bg}">${metricDef.name}</td>`;

            pnlState.months.forEach(month => {
                visibleScens.forEach(scen => {
                    let d = row.scenarios[scen.id] || {};
                    let mData = d[month] || {vol:0, rev:0, exp:0};
                    
                    if (month === 'ИТОГО') {
                        mData = {vol:0, rev:0, exp:0};
                        MONTHS.forEach(mm => {
                            if(d[mm]) { mData.vol += d[mm].vol; mData.rev += d[mm].rev; mData.exp += d[mm].exp; }
                        });
                    }

                    let val = 0;
                    if (mId === 'vol') val = mData.vol;
                    if (mId === 'rev') val = mData.rev;
                    if (mId === 'exp') val = mData.exp;
                    if (mId === 'ebitda') val = mData.rev - mData.exp;
                    if (mId === 'price') val = mData.vol > 0 ? mData.rev / (mData.vol * 1000) : 0;
                    if (mId === 'margin') val = mData.rev > 0 ? ((mData.rev - mData.exp) / mData.rev) * 100 : 0;

                    let isRowTotal = (row.level === 1 || month === 'ИТОГО');
                    let bgClass = isRowTotal ? 'class="is-total"' : '';
                    tr += `<td ${bgClass}>${formatVal(val, metricDef.isPct)}</td>`;
                });
            });
            tr += '</tr>';
            tbody += tr;
        });
    });

    let paginationControls = '';
    if (totalPages > 1) {
        paginationControls = `
        <div class="pagination">
            <button class="page-btn" onclick="changePage(-1)" ${pnlState.page === 1 ? 'disabled' : ''}>← Назад</button>
            <span class="page-info">Страница ${pnlState.page} из ${totalPages}</span>
            <button class="page-btn" onclick="changePage(1)" ${pnlState.page === totalPages ? 'disabled' : ''}>Вперед →</button>
        </div>`;
    }

    document.getElementById('tbl-results-container').innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>` + paginationControls;
}

// --- ДВУХПРОХОДНОЕ МАТЕМАТИЧЕСКОЕ ЯДРО (ОПТИМИЗАТОР P&L) ---
window.runCalculationEngine = function() {
    document.getElementById('tbl-results-container').innerHTML = '<div class="loading-overlay">Расчет...</div>';
    recalculateDependentTables();
    
    setTimeout(() => {
        let pnlAgg = {};
        window.systemCalculatedGraph = {}; 
        
        scenarios.forEach(scen => {
            if (!scen.visible) return;
            window.systemCalculatedGraph[scen.id] = {};
            
            let totalExp = 0;
            for(let e=0; e<EXPENSES.length; e++) totalExp += getSt(`exp_${e}_0`, scen.id);
            
            let netMonthLimits = {};
            NETWORKS.forEach((net, nIdx) => {
                netMonthLimits[net] = {};
                MONTHS.forEach((month, mIdx) => {
                    let limitVal = tableData[`net_cap_${nIdx}_${mIdx}_${scen.id}`];
                    netMonthLimits[net][mIdx] = (limitVal === undefined || limitVal === null || limitVal === '') ? Infinity : (parseFloat(limitVal) || 0);
                });
            });

            let packMonthLimits = {};
            SORTS.forEach((sort, sIdx) => {
                packMonthLimits[sIdx] = {};
                PACKAGING.forEach((pack, pIdx) => {
                    packMonthLimits[sIdx][pIdx] = {};
                    MONTHS.forEach((month, mIdx) => {
                        let limitVal = tableData[`pack_cap_${sIdx}_${pIdx}_${mIdx}_${scen.id}`];
                        packMonthLimits[sIdx][pIdx][mIdx] = (limitVal === undefined || limitVal === null || limitVal === '') ? Infinity : (parseFloat(limitVal) || 0);
                    });
                });
            });

            let detMonthLimits = {};
            SORTS.forEach((sort, sIdx) => {
                detMonthLimits[sIdx] = {};
                NETWORKS.forEach((net, nIdx) => {
                    detMonthLimits[sIdx][nIdx] = {};
                    PACKAGING.forEach((pack, pIdx) => {
                        detMonthLimits[sIdx][nIdx][pIdx] = {};
                        MONTHS.forEach((month, mIdx) => {
                            let limitVal = tableData[`det_cap_${sIdx}_${nIdx}_${pIdx}_${mIdx}_${scen.id}`];
                            detMonthLimits[sIdx][nIdx][pIdx][mIdx] = (limitVal === undefined || limitVal === null || limitVal === '') ? Infinity : (parseFloat(limitVal) || 0);
                        });
                    });
                });
            });
            
            SORTS.forEach((sort, sIdx) => {
                window.systemCalculatedGraph[scen.id][sIdx] = Array(12).fill(0);
                let basePrice = getSt(`p_base_${sIdx}_0`, scen.id) || 0;
                
                let monthTargets = {};
                let graphSum = 0;
                MONTHS.forEach((month, mIdx) => {
                    let key = `grph_${sIdx}_${mIdx}_${scen.id}`;
                    let val = tableData[key];
                    if (val !== undefined && val !== null && val !== '' && parseFloat(val) > 0) {
                        let num = Math.round(parseFloat(val));
                        monthTargets[mIdx] = { active: true, target: num };
                        graphSum += num;
                    } else {
                        monthTargets[mIdx] = { active: false, target: 0 };
                    }
                });

                let gross = getSt(`vol_${sIdx}_2`, scen.id) || 0;
                if (gross <= 0 && graphSum > 0) gross = graphSum;
                if (gross <= 0) return;

                let pctInd = (getSt(`vol_${sIdx}_3`, scen.id) || 0) / 100;
                let absStorage = getSt(`vol_${sIdx}_4`, scen.id);
                let pctLoss = (getSt(`vol_${sIdx}_6`, scen.id) || 0) / 100;
                
                let volIndustrial = gross * pctInd; 
                let volCommercial = gross - volIndustrial;
                
                let rawStorage = (absStorage !== undefined && absStorage !== null && absStorage !== '') ? (parseFloat(absStorage) || 0) : volCommercial;
                
                let volLosses = rawStorage * pctLoss; 
                let remStorageNet = Math.max(0, rawStorage - volLosses);
                let remDirect = Math.max(0, volCommercial - rawStorage) + volIndustrial;

                let sumCls = 0; CLASSES.forEach((_, c) => sumCls += getSt(`q_cls_${sIdx}_${c}`, scen.id));
                let sumCal = 0; CALIBERS.forEach((_, c) => sumCal += getSt(`q_call_${sIdx}_${c}`, scen.id));
                let sumPackArr = [];
                CALIBERS.forEach((_, c) => {
                    let sP = 0; PACKAGING.forEach((_, p) => sP += getSt(`mix_${c}_${p}`, scen.id));
                    sumPackArr[c] = sP;
                });

                let salesSlots = [];
                let fractionDemand = {}; 

                MONTHS.forEach((month, mIdx) => {
                    let isAutumn = ['Авг', 'Сен', 'Окт', 'Ноя'].includes(month);
                    
                    let capKey = `cap_${sIdx}_${mIdx}_${scen.id}`;
                    let capVal = tableData[capKey];
                    let parsedCap = parseFloat(capVal);
                    let defaultCap = (!isNaN(parsedCap) && parsedCap !== 0) ? parsedCap : Infinity;
                    if (capVal === undefined || capVal === null || capVal === '') defaultCap = Infinity;
                    if (capVal == '0') defaultCap = 0;

                    let targetVolume = monthTargets[mIdx].active ? monthTargets[mIdx].target : defaultCap;
                    if (targetVolume <= 0) return;
                    
                    let overridePrice = tableData[`p_fin_${sIdx}_${mIdx}_${scen.id}`];
                    let hasOverride = (overridePrice !== undefined && overridePrice !== null && overridePrice !== '');
                    let calcAvg = getCalculatedAvgPrice(sIdx, scen.id);
                    let monthPriceMultiplier = (hasOverride && calcAvg > 0) ? (overridePrice / calcAvg) : 1;

                    CLASSES.forEach((cls, clsIdx) => {
                        let rawCls = getSt(`q_cls_${sIdx}_${clsIdx}`, scen.id);
                        let pCls = sumCls > 0 ? (rawCls / sumCls) : (1 / CLASSES.length);
                        let clsMod = getSt(`p_cls_${clsIdx}_0`, scen.id) / 100;
                        if (pCls <= 0) return;
                        
                        CALIBERS.forEach((cal, calIdx) => {
                            let tablePref = (clsIdx === 0) ? 'q_call' : 'q_calX'; 
                            let rawCal = getSt(`${tablePref}_${sIdx}_${calIdx}`, scen.id);
                            let pCal = sumCal > 0 ? (rawCal / sumCal) : (1 / CALIBERS.length);
                            let calMod = getSt(`p_cal_${calIdx}_0`, scen.id) / 100;
                            if (pCal <= 0) return;
                            
                            PACKAGING.forEach((pack, packIdx) => {
                                let rawPack = getSt(`mix_${calIdx}_${packIdx}`, scen.id);
                                let sP = sumPackArr[calIdx];
                                let pPack = sP > 0 ? (rawPack / sP) : (1 / PACKAGING.length);
                                let packMod = getSt(`p_pack_${packIdx}_0`, scen.id) / 100;
                                if (pPack <= 0) return;
                                
                                let fractionShare = pCls * pCal * pPack;
                                let fractionVol = targetVolume * fractionShare;
                                let fractionId = `${mIdx}_${clsIdx}_${calIdx}_${packIdx}`;
                                
                                fractionDemand[fractionId] = fractionVol;
                                
                                NETWORKS.forEach((net, nIdx) => {
                                    let netMod = getSt(`p_net_${nIdx}_0`, scen.id) / 100;
                                    let standardPrice = basePrice * (1 + netMod + clsMod + calMod + packMod);
                                    let finalPrice = hasOverride ? (standardPrice * monthPriceMultiplier) : standardPrice;
                                    if (hasOverride && calcAvg === 0) finalPrice = overridePrice;
                                    
                                    salesSlots.push({
                                        month, mIdx, isAutumn, net, nIdx, fractionId,
                                        price: finalPrice, pIdx: packIdx, cIdx: clsIdx, calIdx: calIdx,
                                        isManual: monthTargets[mIdx].active
                                    });
                                });
                            });
                        });
                    });
                });
                
                salesSlots.sort((a, b) => {
                    if (a.isManual !== b.isManual) return a.isManual ? -1 : 1; 
                    return b.price - a.price; 
                });
                
                salesSlots.forEach(slot => {
                    let needed = fractionDemand[slot.fractionId];
                    let netLimit = netMonthLimits[slot.net][slot.mIdx];
                    let packLimit = packMonthLimits[sIdx][slot.pIdx][slot.mIdx];
                    let detLimit = detMonthLimits[sIdx][slot.nIdx][slot.pIdx][slot.mIdx];
                    
                    if (needed <= 0 || netLimit <= 0 || packLimit <= 0 || detLimit <= 0) return;

                    let sellVol = 0;
                    if (slot.isAutumn && remDirect > 0) {
                        sellVol = Math.min(remDirect, needed, netLimit, packLimit, detLimit);
                        remDirect -= sellVol;
                    } 
                    else if (remStorageNet > 0) {
                        sellVol = Math.min(remStorageNet, needed, netLimit, packLimit, detLimit);
                        remStorageNet -= sellVol;
                    }
                    
                    if (sellVol <= 0) return;
                    
                    fractionDemand[slot.fractionId] -= sellVol;
                    netMonthLimits[slot.net][slot.mIdx] -= sellVol;
                    packMonthLimits[sIdx][slot.pIdx][slot.mIdx] -= sellVol;
                    detMonthLimits[sIdx][slot.nIdx][slot.pIdx][slot.mIdx] -= sellVol;
                    
                    window.systemCalculatedGraph[scen.id][sIdx][slot.mIdx] += sellVol;
                    
                    let packName = PACKAGING[slot.pIdx] || 'Прочее';
                    let clsName = CLASSES[slot.cIdx] || 'Прочее';
                    let calName = CALIBERS[slot.calIdx] || 'Прочее';

                    let rowKey = `${sort}_${slot.net}_${packName}_${clsName}_${calName}`;
                    if(!pnlAgg[rowKey]) {
                        pnlAgg[rowKey] = { sort: sort, net: slot.net, pack: packName, cls: clsName, cal: calName, scenarios: {} };
                    }
                    if(!pnlAgg[rowKey].scenarios[scen.id]) pnlAgg[rowKey].scenarios[scen.id] = {};
                    if(!pnlAgg[rowKey].scenarios[scen.id][slot.month]) pnlAgg[rowKey].scenarios[scen.id][slot.month] = {vol: 0, rev: 0, exp: 0};
                    
                    pnlAgg[rowKey].scenarios[scen.id][slot.month].vol += sellVol;
                    pnlAgg[rowKey].scenarios[scen.id][slot.month].rev += (sellVol * 1000) * slot.price;
                    pnlAgg[rowKey].scenarios[scen.id][slot.month].exp += (sellVol / gross) * totalExp;
                });
            });
        });
        
        // Применяем залитые факты в P&L
        for (let key in tableData) {
            if (key.startsWith('fact_')) {
                let match = key.match(/^fact_(.+)_(.+)_(.+)_(.+)_(.+)_(.+)_(vol|rev|exp)$/);
                if (match) {
                    let [_, sSort, sNet, sPack, sCls, sCal, sMonth, sMetric] = match;
                    let rowKey = `${sSort}_${sNet}_${sPack}_${sCls}_${sCal}`;
                    if (!pnlAgg[rowKey]) {
                        pnlAgg[rowKey] = { sort: sSort, net: sNet, pack: sPack, cls: sCls, cal: sCal, scenarios: {} };
                    }
                    if (!pnlAgg[rowKey].scenarios['scur']) pnlAgg[rowKey].scenarios['scur'] = {};
                    if (!pnlAgg[rowKey].scenarios['scur'][sMonth]) pnlAgg[rowKey].scenarios['scur'][sMonth] = {vol:0, rev:0, exp:0};
                    
                    pnlAgg[rowKey].scenarios['scur'][sMonth][sMetric] = parseFloat(tableData[key]);
                }
            }
        }

        // --- САНИТАЙЗЕР: Жесткое округление всех системных расчетов перед выдачей в таблицы ---
        for(let sc in window.systemCalculatedGraph) {
            for(let s in window.systemCalculatedGraph[sc]) {
                for(let m in window.systemCalculatedGraph[sc][s]) {
                    window.systemCalculatedGraph[sc][s][m] = Math.round(window.systemCalculatedGraph[sc][s][m]);
                }
            }
        }
        for (let key in pnlAgg) {
            for (let sc in pnlAgg[key].scenarios) {
                for (let m in pnlAgg[key].scenarios[sc]) {
                    pnlAgg[key].scenarios[sc][m].vol = Math.round(pnlAgg[key].scenarios[sc][m].vol);
                    pnlAgg[key].scenarios[sc][m].rev = Math.round(pnlAgg[key].scenarios[sc][m].rev);
                    pnlAgg[key].scenarios[sc][m].exp = Math.round(pnlAgg[key].scenarios[sc][m].exp);
                }
            }
        }
        // --- КОНЕЦ САНИТАЙЗЕРА ---

        finalPnlResults = Object.values(pnlAgg);
        pnlState.page = 1;
        renderPnlTable();
        buildMonthlyGraphTable();
        
        switchTab('tab-pnl', document.querySelectorAll('.nav-item')[6]);
    }, 50);
}

// --- УНИВЕРСАЛЬНЫЙ ИМПОРТ И ЭКСПОРТ ИЗ EXCEL ---
let currentUploadTarget = 'generic';

window.triggerLoad = function(e, target = 'generic') {
    e.stopPropagation();
    currentUploadTarget = target;
    document.getElementById('file-upload').value = '';
    document.getElementById('file-upload').click();
}

document.getElementById('file-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    setSyncStatus("Чтение файла...");
    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        try {
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            const skipWords = ['2025', '2026', '2027', 'сорт', 'итого', 'scur', 's2025', '1', 'факт', 'прогноз', 'бюджет', 'категория'];

            function parseCellNum(val) {
                if (val === undefined || val === null) return NaN;
                let s = String(val).replace(/\s/g,'').replace(/\u00A0/g,'').replace(',', '.');
                return parseFloat(s);
            }

            let parsedCount = 0;

            if (['vol', 'q_cls', 'q_col', 'q_call', 'q_calX', 'p_base', 'generic'].includes(currentUploadTarget)) {
                let newSorts = [];
                for(let i=0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length === 0) continue;

                    let sortColIdx = -1;
                    for (let j=0; j < row.length; j++) {
                        if (row[j] && typeof row[j] === 'string') {
                            let text = String(row[j]).trim().toLowerCase();
                            let shouldSkip = skipWords.some(w => text.includes(w));
                            if (text && !shouldSkip && text.length < 30) {
                                sortColIdx = j;
                                break;
                            }
                        }
                    }

                    if (sortColIdx !== -1) {
                        let sortName = String(row[sortColIdx]).trim();
                        if (sortName.length > 0) {
                            newSorts.push(sortName);
                            let sIdx = newSorts.length - 1;

                            if (currentUploadTarget === 'p_base' || currentUploadTarget === 'generic') {
                                let val1 = parseCellNum(row[sortColIdx + 1]);
                                let val2 = parseCellNum(row[sortColIdx + 2]);
                                if (!isNaN(val1)) tableData[`p_base_${sIdx}_0_s2025`] = Math.round(val1);
                                if (!isNaN(val2)) tableData[`p_base_${sIdx}_0_scur`] = Math.round(val2);
                            }

                            if (currentUploadTarget === 'vol' || currentUploadTarget === 'generic') {
                                for(let c=0; c<7; c++) { 
                                    if (c === 0 || c === 1 || c === 5) {
                                        let valText = row[sortColIdx + 1 + c];
                                        if (valText) tableData[`vol_${sIdx}_${c}_scur`] = valText;
                                    } else {
                                        let v = parseCellNum(row[sortColIdx + 1 + c]);
                                        if(!isNaN(v)) {
                                            if ((c === 3 || c === 6)) {
                                                if (Math.abs(v) <= 2 && v !== 0) v *= 100;
                                                tableData[`vol_${sIdx}_${c}_scur`] = Math.round(v * 10) / 10;
                                            } else {
                                                tableData[`vol_${sIdx}_${c}_scur`] = Math.round(v);
                                            }
                                        }
                                    }
                                }
                            }

                            if (['q_cls', 'q_col', 'q_call', 'q_calX'].includes(currentUploadTarget)) {
                                let colCount = currentUploadTarget === 'q_cls' ? CLASSES.length :
                                               currentUploadTarget === 'q_col' ? COLORS.length : CALIBERS.length;
                                for(let c=0; c<colCount; c++) {
                                    let v = parseCellNum(row[sortColIdx + 1 + c]);
                                    if(!isNaN(v)) {
                                        if (Math.abs(v) <= 2 && v !== 0) v *= 100;
                                        tableData[`${currentUploadTarget}_${sIdx}_${c}_scur`] = Math.round(v * 10) / 10;
                                    }
                                }
                            }
                        }
                    }
                }
                if (newSorts.length > 0) {
                    SORTS.length = 0; SORTS.push(...newSorts);
                    parsedCount = newSorts.length;
                }
            } else if (currentUploadTarget === 'pnl_fact') {
                for(let i=1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length < 8) continue;
                    let sort = String(row[0] || '').trim();
                    let net = String(row[1] || '').trim();
                    let pack = String(row[2] || '').trim();
                    let cls = String(row[3] || '').trim();
                    let cal = String(row[4] || '').trim();
                    let month = String(row[5] || '').trim();
                    let metric = String(row[6] || '').trim().toLowerCase(); 
                    let val = parseCellNum(row[7]);

                    if (!isNaN(val) && sort && net && pack && month && metric) {
                        tableData[`fact_${sort}_${net}_${pack}_${cls}_${cal}_${month}_${metric}`] = val;
                        parsedCount++;
                    }
                }
            } else if (currentUploadTarget === 'p_net') {
                let newNets = [];
                for(let i=0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length === 0) continue;
                    let firstText = String(row[0] || '').trim();
                    const skipWordsNets = ['2025', '2026', '2027', 'торговая', 'сеть', 'итого', 'scur'];
                    let shouldSkip = skipWordsNets.some(w => firstText.toLowerCase().includes(w));
                    if (firstText && !shouldSkip && firstText.length < 50) {
                        newNets.push(firstText);
                        let nIdx = newNets.length - 1;
                        let val1 = parseCellNum(row[1]);
                        let val2 = parseCellNum(row[2]);
                        if(!isNaN(val1)) {
                            if (Math.abs(val1) <= 2 && val1 !== 0) val1 *= 100;
                            tableData[`p_net_${nIdx}_0_s2025`] = Math.round(val1 * 10) / 10;
                        }
                        if(!isNaN(val2)) {
                            if (Math.abs(val2) <= 2 && val2 !== 0) val2 *= 100;
                            tableData[`p_net_${nIdx}_0_scur`] = Math.round(val2 * 10) / 10;
                        }
                    }
                }
                if (newNets.length > 0) {
                    NETWORKS.length = 0; NETWORKS.push(...newNets);
                    tableData['_meta_networks'] = NETWORKS;
                    parsedCount = newNets.length;
                }

            } else if (currentUploadTarget === 'p_fin') {
                for(let i=1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length < 14) continue;
                    let sortName = String(row[0] || '').trim();
                    let scenId = String(row[1] || '').trim();
                    let matchedSortIdx = SORTS.findIndex(s => sortName.toLowerCase() === s.toLowerCase() || sortName.toLowerCase().includes(s.toLowerCase()));
                    if (matchedSortIdx !== -1 && (scenId === 's2025' || scenId === 'scur')) {
                        for(let m = 0; m < MONTHS.length; m++) {
                            let v = parseCellNum(row[2 + m]);
                            if(!isNaN(v)) tableData[`p_fin_${matchedSortIdx}_${m}_${scenId}`] = Math.round(v);
                        }
                        parsedCount++;
                    }
                }

            } else if (currentUploadTarget === 'grph') {
                for(let i=1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length < 13) continue;
                    let sortName = String(row[0] || row[1] || row[2] || '').trim();
                    if (sortName.toLowerCase().includes('итого') || sortName.toLowerCase().includes('общий')) continue;
                    let matchedSortIdx = SORTS.findIndex(s => sortName.toLowerCase() === s.toLowerCase() || sortName.toLowerCase().includes(s.toLowerCase()));
                    if (matchedSortIdx !== -1) {
                        for(let m = 0; m < MONTHS.length; m++) {
                            let v = parseCellNum(row[1 + m]);
                            if(!isNaN(v)) tableData[`grph_${matchedSortIdx}_${m}_scur`] = Math.round(v);
                        }
                        parsedCount++;
                    }
                }

            } else if (currentUploadTarget === 'mix') {
                for(let i=0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length === 0) continue;
                    let firstText = String(row[0] || '').trim();
                    let calIdx = CALIBERS.findIndex(c => firstText.toLowerCase().includes(c.toLowerCase()));
                    if (calIdx !== -1) {
                        for(let p=0; p<PACKAGING.length; p++) {
                            let v = parseCellNum(row[p + 1]);
                            if(!isNaN(v)) tableData[`mix_${calIdx}_${p}_scur`] = Math.round(v * 10) / 10;
                        }
                        parsedCount++;
                    }
                }

            } else if (currentUploadTarget === 'cap') {
                for(let i=0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length === 0) continue;
                    let firstText = String(row[0] || '').trim();
                    let sortIdx = SORTS.findIndex(s => firstText.toLowerCase().includes(s.toLowerCase()));
                    if (sortIdx !== -1) {
                        for(let m=0; m<MONTHS.length; m++) {
                            let v = parseCellNum(row[m + 1]);
                            if(!isNaN(v)) tableData[`cap_${sortIdx}_${m}_scur`] = Math.round(v);
                        }
                        parsedCount++;
                    }
                }
            
            } else if (currentUploadTarget === 'net_cap') {
                for(let i=1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length < 2) continue;
                    let netName = String(row[0] || '').trim();
                    let nIdx = NETWORKS.findIndex(n => netName.toLowerCase() === n.toLowerCase() || netName.toLowerCase().includes(n.toLowerCase()));
                    if (nIdx !== -1) {
                        for(let m=0; m<MONTHS.length; m++) {
                            let v = parseCellNum(row[m + 1]);
                            if(!isNaN(v)) tableData[`net_cap_${nIdx}_${m}_scur`] = Math.round(v);
                        }
                        parsedCount++;
                    }
                }

            } else if (currentUploadTarget === 'pack_cap') {
                for(let i=1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length < 3) continue;
                    let sortName = String(row[0] || '').trim();
                    let packName = String(row[1] || '').trim();
                    let sIdx = SORTS.findIndex(s => sortName.toLowerCase() === s.toLowerCase() || sortName.toLowerCase().includes(s.toLowerCase()));
                    let pIdx = PACKAGING.findIndex(p => packName.toLowerCase() === p.toLowerCase() || packName.toLowerCase().includes(p.toLowerCase()));
                    if (sIdx !== -1 && pIdx !== -1) {
                        for(let m=0; m<MONTHS.length; m++) {
                            let v = parseCellNum(row[m + 2]);
                            if(!isNaN(v)) tableData[`pack_cap_${sIdx}_${pIdx}_${m}_scur`] = Math.round(v);
                        }
                        parsedCount++;
                    }
                }

            } else if (currentUploadTarget === 'det_cap') {
                for(let i=1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length < 4) continue;
                    let sortName = String(row[0] || '').trim();
                    let netName = String(row[1] || '').trim();
                    let packName = String(row[2] || '').trim();
                    
                    let sIdx = SORTS.findIndex(s => sortName.toLowerCase() === s.toLowerCase() || sortName.toLowerCase().includes(s.toLowerCase()));
                    let nIdx = NETWORKS.findIndex(n => netName.toLowerCase() === n.toLowerCase() || netName.toLowerCase().includes(n.toLowerCase()));
                    let pIdx = PACKAGING.findIndex(p => packName.toLowerCase() === p.toLowerCase() || packName.toLowerCase().includes(p.toLowerCase()));
                    
                    if (sIdx !== -1 && nIdx !== -1 && pIdx !== -1) {
                        for(let m=0; m<MONTHS.length; m++) {
                            let v = parseCellNum(row[m + 3]);
                            if(!isNaN(v)) tableData[`det_cap_${sIdx}_${nIdx}_${pIdx}_${m}_scur`] = Math.round(v);
                        }
                        parsedCount++;
                    }
                }

            } else if (currentUploadTarget === 'exp_detailed') {
                for(let i=1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length < 3) continue;
                    
                    let sortName = String(row[1] || '').trim(); 
                    if(!sortName) continue;
                    
                    let matchedSortIdx = SORTS.findIndex(s => sortName.toLowerCase() === s.toLowerCase() || sortName.toLowerCase().includes(s.toLowerCase()));
                    if (matchedSortIdx !== -1) {
                        let colIdx = 0;
                        for(let c = 0; c < 23; c++) {
                            if (c === 1) continue; 
                            let rawVal = row[c];
                            let val = rawVal !== undefined ? rawVal : '';
                            
                            if (typeof rawVal === 'string') {
                                let cleanStr = rawVal.replace(/\s/g,'').replace(/\u00A0/g,'').replace(',', '.').replace('%','');
                                let parsedNum = parseFloat(cleanStr);
                                if (!isNaN(parsedNum) && /^[0-9.,\-]+$/.test(cleanStr)) {
                                    val = parsedNum;
                                }
                            }
                            tableData[`expdet_${matchedSortIdx}_${colIdx}_scur`] = val;
                            colIdx++;
                        }
                        parsedCount++;
                    }
                }

            } else if (['p_pack', 'p_cls', 'p_cal', 'exp'].includes(currentUploadTarget)) {
                let itemsArr = currentUploadTarget === 'p_pack' ? PACKAGING :
                               currentUploadTarget === 'p_cls' ? CLASSES :
                               currentUploadTarget === 'p_cal' ? CALIBERS : EXPENSES;
                for(let i=0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if(!row || row.length === 0) continue;
                    let firstText = String(row[0] || '').trim();
                    if(!firstText) continue;

                    let itemIdx = itemsArr.findIndex(it => {
                        let t1 = firstText.toLowerCase().trim();
                        let t2 = it.toLowerCase().trim();
                        return t1 === t2 || t1.includes(t2) || t2.includes(t1);
                    });

                    if (itemIdx !== -1) {
                        let val1 = parseCellNum(row[1]);
                        let val2 = parseCellNum(row[2]);
                        if (!isNaN(val1)) {
                            if (Math.abs(val1) <= 2 && val1 !== 0) val1 *= 100;
                            tableData[`${currentUploadTarget}_${itemIdx}_0_s2025`] = Math.round(val1 * 10) / 10;
                        }
                        if (!isNaN(val2)) {
                            if (Math.abs(val2) <= 2 && val2 !== 0) val2 *= 100;
                            tableData[`${currentUploadTarget}_${itemIdx}_0_scur`] = Math.round(val2 * 10) / 10;
                        }
                        parsedCount++;
                    }
                }
            }

            generateAllTables();
            initPnlControls();
            if (finalPnlResults.length > 0) runCalculationEngine();
            autoSaveToBackend();
            setSyncStatus("Синхронизировано");
            alert(`Файл успешно обработан!\nЗагружено записей/строк: ${parsedCount || SORTS.length}`);

        } catch (error) {
            console.error(error);
            alert("Произошла ошибка при чтении файла. Проверьте формат.");
            setSyncStatus("Ошибка чтения", true);
        }
    };
    reader.readAsArrayBuffer(file);
});

window.triggerExport = function(e, target) {
    e.stopPropagation();
    let map = {
        'vol': 'tbl-volumes', 'q_cls': 'tbl-qual-classes', 'q_col': 'tbl-qual-colors', 'q_call': 'tbl-qual-cal-1', 'q_calX': 'tbl-qual-cal-ext',
        'grph': 'tbl-graph', 'mix': 'mix-tables-container', 'net_cap': 'tbl-cap-net', 'pack_cap': 'tbl-cap-pack', 'det_cap': 'tbl-cap-det',
        'cap': 'tbl-cap-sort', 'p_net': 'tbl-prc-net', 'p_pack': 'tbl-prc-pack', 'p_cls': 'tbl-prc-cls', 'p_cal': 'tbl-prc-cal',
        'p_fin': 'tbl-prc-monthly', 'p_base': 'tbl-prc-base', 'exp': 'tbl-expenses', 'exp_detailed': 'tbl-exp-detailed'
    };
    
    let containerId = map[target];
    let container = document.getElementById(containerId);
    if(!container) return;
    
    let wb = XLSX.utils.book_new();
    let tables = container.querySelectorAll('table');
    tables.forEach((tbl, idx) => {
        let clone = tbl.cloneNode(true);
        let inputs = clone.querySelectorAll('input, select');
        let origInputs = tbl.querySelectorAll('input, select');
        
        for(let i=0; i<inputs.length; i++) {
            let val = origInputs[i].value || origInputs[i].placeholder || '';
            val = val.replace(/\u00A0/g, ''); 
            let parent = inputs[i].parentNode;
            parent.innerHTML = val;
        }
        
        let ws = XLSX.utils.table_to_sheet(clone);
        XLSX.utils.book_append_sheet(wb, ws, tables.length > 1 ? `Sheet_${idx+1}` : "Data");
    });
    XLSX.writeFile(wb, `Export_${target}.xlsx`);
}

window.exportData = async function() {
    if (finalPnlResults.length === 0) {
        alert("Сначала сформируйте план продаж!");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('План выручки P&L', {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }]
    });

    let visibleScens = scenarios.filter(s => s.visible);
    let headerRow1 = ['Сорт', 'Торговая Сеть', 'Финансовый показатель'];
    pnlState.months.forEach(m => { visibleScens.forEach(() => headerRow1.push(m)); });
    worksheet.addRow(headerRow1);

    let headerRow2 = ['', '', ''];
    pnlState.months.forEach(m => { visibleScens.forEach(s => headerRow2.push(s.name)); });
    worksheet.addRow(headerRow2);

    worksheet.mergeCells('A1:A2');
    worksheet.mergeCells('B1:B2');
    worksheet.mergeCells('C1:C2');

    let colIndex = 4;
    pnlState.months.forEach(() => {
        if (visibleScens.length > 1) worksheet.mergeCells(1, colIndex, 1, colIndex + visibleScens.length - 1);
        colIndex += visibleScens.length;
    });

    [worksheet.getRow(1), worksheet.getRow(2)].forEach(row => {
        row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F774A' } };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Platform LC', size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: {style: 'thin', color: {argb: 'FFD0D7D2'}}, bottom: {style: 'thin', color: {argb: 'FFD0D7D2'}} };
        });
    });

    let filteredData = finalPnlResults.filter(r => 
        pnlState.sorts.includes(r.sort) && 
        pnlState.nets.includes(r.net) && 
        pnlState.packs.includes(r.pack) &&
        pnlState.cls.includes(r.cls) &&
        pnlState.cal.includes(r.cal)
    );

    filteredData.forEach(row => {
        pnlState.metrics.forEach(mId => {
            let metricDef = METRICS.find(m => m.id === mId);
            let rowData = [row.sort, row.net, metricDef.name];

            pnlState.months.forEach(month => {
                visibleScens.forEach(scen => {
                    let d = row.scenarios[scen.id] || {};
                    let mData = d[month] || {vol:0, rev:0, exp:0};
                    if (month === 'ИТОГО') {
                        mData = {vol:0, rev:0, exp:0};
                        MONTHS.forEach(mm => {
                            if(d[mm]) { mData.vol += d[mm].vol; mData.rev += d[mm].rev; mData.exp += d[mm].exp; }
                        });
                    }

                    let val = 0;
                    if (mId === 'vol') val = mData.vol;
                    if (mId === 'rev') val = mData.rev;
                    if (mId === 'exp') val = mData.exp;
                    if (mId === 'ebitda') val = mData.rev - mData.exp;
                    if (mId === 'price') val = mData.vol > 0 ? mData.rev / (mData.vol * 1000) : 0;
                    if (mId === 'margin') val = mData.rev > 0 ? ((mData.rev - mData.exp) / mData.rev) : 0;

                    let finalVal = metricDef.isPct ? (Math.round(val * 10) / 1000) : Math.round(val);
                    rowData.push(finalVal);
                });
            });

            let newRow = worksheet.addRow(rowData);
            newRow.eachCell((cell, colNum) => {
                cell.font = { name: 'Platform LC', size: 10, color: { argb: 'FF000000' } };
                cell.border = { top: {style: 'thin', color: {argb: 'FFD0D7D2'}}, bottom: {style: 'thin', color: {argb: 'FFD0D7D2'}} };
                if (colNum <= 3) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F2E9' } };
                    cell.font.bold = true;
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                } else {
                    cell.numFmt = metricDef.isPct ? '0.0%' : '#,##0';
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    
                    let monthGroupIdx = Math.floor((colNum - 4) / visibleScens.length);
                    let isTotalCol = pnlState.months[monthGroupIdx] === 'ИТОГО';
                    if (isTotalCol) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F9F4' } };
                        cell.font.bold = true;
                    }
                }
            });
        });
    });

    worksheet.getColumn(1).width = 15;
    worksheet.getColumn(2).width = 18;
    worksheet.getColumn(3).width = 30;
    for(let i=4; i<=3+pnlState.months.length*visibleScens.length; i++) worksheet.getColumn(i).width = 14;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Sales_Plan_Analytic_Report.xlsx";
    link.click();
}