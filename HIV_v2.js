#!/usr/bin/env node
/**
 * HIV重组序列绘图工具 - Node.js 命令行版本 (v2)
 *
 * 更新内容：
 * 1. 支持 -i, -pdf, -png 命名参数
 * 2. 输入文件忽略 '#' 注释，从 '>' 行后开始读取
 * 3. 支持同时输出 PNG (300dpi) 和 PDF
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// ============================================
// 1. 参数解析与验证
// ============================================
const args = process.argv.slice(2);
const params = {
  input: null,
  pdf: null,
  png: null
};

// 解析命令行参数
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-i' && args[i + 1]) {
    params.input = args[++i];
  } else if (arg === '-pdf' && args[i + 1]) {
    params.pdf = args[++i];
  } else if (arg === '-png' && args[i + 1]) {
    params.png = args[++i];
  }
}

// 验证必要参数
if (!params.input) {
  console.error('错误: 必须指定输入文件 (-i)');
  printUsage();
  process.exit(1);
}

if (!params.pdf && !params.png) {
  console.error('错误: 必须指定至少一种输出格式 (-pdf 或 -png)');
  printUsage();
  process.exit(1);
}

function printUsage() {
  console.log('\n用法: node HIV_v1.js -i <输入.txt> [-pdf <输出.pdf>] [-png <输出.png>]');
  console.log('示例: node HIV_v1.js -i data.txt -pdf out.pdf -png out.png\n');
}

// 验证输入文件存在
if (!fs.existsSync(params.input)) {
  console.error(`错误: 输入文件不存在: ${params.input}`);
  process.exit(1);
}

// ============================================
// 颜色配置
// ============================================
const DEFAULT_COLORS = {
  'A': '#FF0000', 'A1': '#FF5700', 'A2': '#FF7E5E',
  'B': '#3F98F2', 'C': '#9D6039', 'D': '#E3A1C9',
  'E': '#FFFF64', 'F': '#BEE120', 'F1': '#C5CAFF',
  'F2': '#97D7FF', 'G': '#4FAE57', 'H': '#FFD700',
  'J': '#20D7CF', 'J1': '#FFB600', 'J2': '#FFD700',
  'K': '#7C45D9', '01': '#7C45D9', '02': '#D7B320',
  '?': '#DCDCDC', 'U': '#DCDCDC'
};

const FALLBACK_COLORS = [
  '#FF6347', '#20B2AA', '#DDA0DD', '#F0E68C', '#BC8F8F',
  '#4682B4', '#D2691E', '#6B8E23', '#CD5C5C', '#708090'
];

const assignedColors = {};
let fallbackColorIndex = 0;

function getColor(subtype) {
  if (DEFAULT_COLORS.hasOwnProperty(subtype)) return DEFAULT_COLORS[subtype];
  if (assignedColors.hasOwnProperty(subtype)) return assignedColors[subtype];
  const color = FALLBACK_COLORS[fallbackColorIndex % FALLBACK_COLORS.length];
  assignedColors[subtype] = color;
  fallbackColorIndex++;
  return color;
}

// ============================================
// 基因图谱配置
// ============================================
const GENE_MAP = [
  // Row 1
  { name: "5' LTR", start: 1, end: 634, row: 1, bgColor: '#CCCCCC' },
  { name: 'gag', start: 790, end: 2292, row: 1, bgColor: '#CCCCCC' },
  { name: 'vif', start: 5041, end: 5619, row: 1, bgColor: '#CCCCCC' },
  { name: '', start: 8379, end: 8469, row: 1, bgColor: '#CCCCCC' },
  { name: 'nef', start: 8797, end: 9417, row: 1, bgColor: '#FFFFFF' },
  // Row 2
  { name: '', start: 5831, end: 6045, row: 2, bgColor: '#FFB6C1', noOverlay: true },
  { name: 'vpu', start: 6062, end: 6310, row: 2, bgColor: '#CCCCCC' },
  { name: '', start: 8379, end: 8653, row: 2, bgColor: '#CCCCCC' },
  { name: "3' LTR", start: 9086, end: 9719, row: 2, bgColor: '#FFFFFF' },
  // Row 3
  { name: 'pol', start: 2085, end: 5096, row: 3, bgColor: '#CCCCCC' },
  { name: 'vpr', start: 5559, end: 5850, row: 3, bgColor: '#CCCCCC' },
  { name: '', start: 5970, end: 6045, row: 3, bgColor: '#CCCCCC' },
  { name: 'env', start: 6225, end: 8795, row: 3, bgColor: '#CCCCCC' }
];

const RENDER_CONFIG = {
  width: 900,
  height: 300,
  margin: { top: 60, right: 50, bottom: 80, left: 50 },
  geneRowHeight: 25,
  geneRowGap: 10,
  axisRange: [0, 9719]
};

// ============================================
// 输入解析 (核心修改)
// ============================================
function parseInput(text) {
  const regions = [];
  if (!text || text.trim() === '') return regions;

  const lines = text.split('\n');
  let headerFound = false; // 标记是否找到了 '>'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 1. 忽略空行
    if (line === '') continue;

    // 2. 忽略 '#' 开头的注释行
    if (line.startsWith('#')) continue;

    // 3. 寻找 '>' 开头的行
    if (line.startsWith('>')) {
      headerFound = true;
      console.log(`找到序列头: ${line}`);
      continue; // 序列头本身不解析，跳过
    }

    // 4. 如果还没找到 '>'，则忽略所有内容
    if (!headerFound) {
      continue;
    }

    // 5. 解析数据行
    const parts = line.split(/[\s\t]+/);
    if (parts.length < 3) {
      console.warn(`警告: 第 ${i + 1} 行格式无效 (忽略): "${line}"`);
      continue;
    }

    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);

    if (isNaN(start) || isNaN(end)) continue;

    const subtype = parts.slice(2).join(' ');
    if (subtype === '') continue;

    let finalStart = start, finalEnd = end;
    if (start > end) { finalStart = end; finalEnd = start; }

    regions.push({
      start: finalStart,
      end: finalEnd,
      subtype: subtype,
      color: getColor(subtype)
    });
  }

  if (!headerFound) {
    console.warn("警告: 未在文件中找到以 '>' 开头的行，未解析任何数据！");
  }

  return regions;
}

function calculateBreakpoints(regions) {
  const breakpoints = [];
  if (!regions || regions.length === 0) return breakpoints;
  const sortedRegions = [...regions].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];
    breakpoints.push({ position: region.start, displayValue: region.start, isFirst: i === 0, isLast: false });
    if (i === sortedRegions.length - 1) {
      breakpoints.push({ position: region.end, displayValue: region.end, isFirst: false, isLast: true });
    }
  }
  return breakpoints;
}

function createXScale() {
  const domain = RENDER_CONFIG.axisRange;
  const range = [RENDER_CONFIG.margin.left, RENDER_CONFIG.width - RENDER_CONFIG.margin.right];
  return function(value) {
    const ratio = (value - domain[0]) / (domain[1] - domain[0]);
    return range[0] + ratio * (range[1] - range[0]);
  };
}

// ============================================
// 核心绘图逻辑 (分离 Canvas 创建与绘制)
// ============================================
function drawToContext(ctx, width, height, regions) {
  const xScale = createXScale();
  const getRowY = (row) => RENDER_CONFIG.margin.top + 20 + (row - 1) * (RENDER_CONFIG.geneRowHeight + RENDER_CONFIG.geneRowGap);

  // 白色背景 (防止透明)
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // 1. 绘制基因图谱背景
  GENE_MAP.forEach(gene => {
    const x = xScale(gene.start);
    const y = getRowY(gene.row);
    const w = xScale(gene.end) - xScale(gene.start);
    ctx.fillStyle = gene.bgColor;
    ctx.fillRect(x, y, w, RENDER_CONFIG.geneRowHeight);
    if (gene.name === 'nef' || gene.name === "3' LTR") {
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 0.2; ctx.strokeRect(x, y, w, RENDER_CONFIG.geneRowHeight);
    }
  });

  // 2. 绘制亚型区域
  regions.forEach(region => {
    GENE_MAP.forEach(gene => {
      const overlapStart = Math.max(region.start, gene.start);
      const overlapEnd = Math.min(region.end, gene.end);
      if (overlapStart < overlapEnd) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = region.color;
        ctx.fillRect(xScale(overlapStart), getRowY(gene.row), xScale(overlapEnd) - xScale(overlapStart), RENDER_CONFIG.geneRowHeight);
        ctx.globalAlpha = 1.0;
      }
    });
  });

  // 3. 绘制基因名称
  ctx.font = '12px "Liberation Sans", Arial, sans-serif'; // 优先使用 Linux 字体
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  GENE_MAP.filter(d => d.name !== '').forEach(gene => {
    const x = xScale(gene.start) + (xScale(gene.end) - xScale(gene.start)) / 2;
    const y = getRowY(gene.row) + RENDER_CONFIG.geneRowHeight / 2;
    ctx.fillText(gene.name, x, y);
  });

  // 4. 绘制连接线 (tat/rev)
  ctx.strokeStyle = '#666666'; ctx.lineWidth = 1;
  
  // tat
  const tatFromX = xScale(6045), tatToX = xScale(8379);
  const tatFromY = getRowY(2) - 5, tatToY = getRowY(1) + RENDER_CONFIG.geneRowHeight / 2;
  ctx.beginPath(); ctx.moveTo(tatFromX, tatFromY); ctx.lineTo(tatFromX, tatToY); ctx.lineTo(tatToX, tatToY); ctx.stroke();
  ctx.fillText('tat', (tatFromX + tatToX) / 2, tatToY - 5);

  // rev
  const revFromX = xScale(6045), revToX = xScale(8379);
  const revFromY = getRowY(3), revToY = getRowY(2) + RENDER_CONFIG.geneRowHeight / 2;
  const revMidY = revFromY - 5, revTurnX = xScale(7200);
  ctx.beginPath(); ctx.moveTo(revFromX, revFromY); ctx.lineTo(revFromX, revMidY); ctx.lineTo(revTurnX, revMidY); ctx.lineTo(revToX, revToY); ctx.stroke();
  ctx.fillText('rev', (revFromX + revTurnX) / 2 + 30, revMidY - 5);

  // 5. 绘制断点
  const breakpoints = calculateBreakpoints(regions);
  const tickStartY = RENDER_CONFIG.margin.top + 20 - 11;
  const tickEndY = tickStartY + 8;
  const numberY = tickStartY - 3;
  
  ctx.strokeStyle = '#333333'; ctx.font = '11px "Liberation Sans", Arial, sans-serif';
  breakpoints.forEach(bp => {
    const x = xScale(bp.position);
    ctx.beginPath(); ctx.moveTo(x, tickStartY); ctx.lineTo(x, tickEndY); ctx.stroke();
    ctx.save(); ctx.translate(x + 4, numberY); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left'; ctx.fillText(bp.displayValue.toString(), 0, 0); ctx.restore();
  });

  // 6. 绘制坐标轴
  const axisY = getRowY(3) + RENDER_CONFIG.geneRowHeight + 10;
  ctx.strokeStyle = '#bdc3c7'; ctx.beginPath();
  ctx.moveTo(RENDER_CONFIG.margin.left, axisY); ctx.lineTo(RENDER_CONFIG.width - RENDER_CONFIG.margin.right, axisY); ctx.stroke();
  
  [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 9719].forEach(value => {
    const x = xScale(value);
    ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
    ctx.fillStyle = '#7f8c8d'; ctx.font = '10px "Liberation Sans", Arial, sans-serif';
    ctx.fillText(value.toString(), x, axisY + 15);
  });

  // 7. 绘制图例
  const subtypeMap = new Map();
  regions.forEach(r => { if (!subtypeMap.has(r.subtype)) subtypeMap.set(r.subtype, r.color); });
  const legendData = Array.from(subtypeMap, ([s, c]) => ({ subtype: s, color: c }));
  const legendY = RENDER_CONFIG.height - 30;
  legendData.forEach((item, i) => {
    const x = RENDER_CONFIG.margin.left + i * 80;
    ctx.fillStyle = item.color; ctx.fillRect(x, legendY, 15, 15);
    ctx.strokeStyle = '#999999'; ctx.lineWidth = 0.5; ctx.strokeRect(x, legendY, 15, 15);
    ctx.fillStyle = '#333333'; ctx.font = '11px "Liberation Sans", Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(item.subtype, x + 20, legendY + 12);
  });
}

// ============================================
// 主程序
// ============================================
try {
  console.log(`读取输入: ${params.input}`);
  const inputText = fs.readFileSync(params.input, 'utf-8');
  const regions = parseInput(inputText);

  if (regions.length === 0) {
    console.error('错误: 未解析到有效数据 (请检查文件是否包含 ">" 开头的行)');
    process.exit(1);
  }
  console.log(`解析成功: 包含 ${regions.length} 个区域`);

  // --- 生成 PNG ---
  if (params.png) {
    const canvasPng = createCanvas(RENDER_CONFIG.width, RENDER_CONFIG.height);
    const ctxPng = canvasPng.getContext('2d');
    drawToContext(ctxPng, RENDER_CONFIG.width, RENDER_CONFIG.height, regions);
    
    // 确保目录存在
    fs.mkdirSync(path.dirname(params.png), { recursive: true });
    
    // 设置 DPI 为 300 (metadata)
    const buffer = canvasPng.toBuffer('image/png', { resolution: 300 });
    fs.writeFileSync(params.png, buffer);
    console.log(`[PNG] 已保存 (300 DPI): ${params.png}`);
  }

  // --- 生成 PDF ---
  if (params.pdf) {
    const canvasPdf = createCanvas(RENDER_CONFIG.width, RENDER_CONFIG.height, 'pdf');
    const ctxPdf = canvasPdf.getContext('2d');
    drawToContext(ctxPdf, RENDER_CONFIG.width, RENDER_CONFIG.height, regions);

    fs.mkdirSync(path.dirname(params.pdf), { recursive: true });
    
    const buffer = canvasPdf.toBuffer('application/pdf');
    fs.writeFileSync(params.pdf, buffer);
    console.log(`[PDF] 已保存: ${params.pdf}`);
  }

} catch (error) {
  console.error(`发生未捕获错误: ${error.message}`);
  process.exit(1);
}