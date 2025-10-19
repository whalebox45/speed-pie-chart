import { Component, ViewChild, ElementRef, signal, effect } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, Chart, registerables, Title } from 'chart.js';
import html2canvas from 'html2canvas';
import { CommonModule } from '@angular/common';

import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(...registerables);
Chart.register(ChartDataLabels);


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {

  @ViewChild('chartContainer') chartContainer?: ElementRef<HTMLCanvasElement>;
  chart!: Chart<'pie'>;

  chartData: ChartData<'pie'> | undefined;
  chartOptions: ChartConfiguration<'pie'>['options'] | undefined;
  chartType: 'pie' = 'pie';

  currentPage = signal<'input' | 'preview'>('input');
  theme = signal<'light' | 'dark'>('light');
  labelMode = signal<'value' | 'labelValue' | 'percent' | 'none'>('labelValue');


  labels = signal(['北區', '中區', '南區']);
  values = signal([30, 40, 30]);

  sortOrder = signal<'input' | 'asc' | 'desc'>('input');

  hasError = signal(false);
  invalidIndices = signal<number[]>([]);

  chartTitle = signal('');

  // --- 新增 render 資料 ---
  renderLabels = signal<string[]>([]);
  renderValues = signal<number[]>([]);

  constructor() {
    // 監看 theme 變化 → 更新 HTML data-theme
    effect(() => {
      const t = this.theme();
      document.documentElement.dataset['theme'] = t;
      this.chartData = this.buildChartData();
      this.chartOptions = this.buildChartOptions();
    });

    // 初始 render 資料
    this.updateSortedData();
  }
  

  updateSortedData() {
    const labels = [...this.labels()];
    const values = [...this.values()];
    const combined = labels.map((l, i) => ({ label: l, value: values[i], idx: i }));

    if (this.sortOrder() === 'asc') {
      combined.sort((a, b) => (a.value - b.value) || (a.idx - b.idx)); // 穩定升序
    } else if (this.sortOrder() === 'desc') {
      combined.sort((a, b) => (b.value - a.value) || (a.idx - b.idx)); // 穩定降序
    }
    // 'input' 就不排序

    this.renderLabels.set(combined.map(c => c.label));
    this.renderValues.set(combined.map(c => c.value));

  }
  

  getTotal(): number {
    return this.renderValues().reduce((a, b) => a + b, 0);
  }


  // 顏色表
  lightColors = ['#0078D4', '#59B2FF', '#A0D2FF', '#F9A8D4', '#FDBA74', '#A7F3D0', '#FECACA'];
  darkColors = ['#4CC9F0', '#4895EF', '#4361EE', '#3A0CA3', '#7209B7', '#F72585', '#FFBA08'];


  private buildChartData(): ChartData<'pie'> {
    const colors = this.theme() === 'light' ? this.lightColors : this.darkColors;
    return {
      labels: this.renderLabels(),
      datasets: [
        {
          data: this.renderValues(),
          backgroundColor: colors.slice(0, this.renderLabels().length),
          borderColor: '#fff',
          borderWidth: 2,
          datalabels: {
            color: this.theme() === 'dark' ? '#fff' : '#000',
            textStrokeColor: this.theme() === 'dark' ? '#333' : '#fff',
            textStrokeWidth: 5,

            font: { size: 24 },
            formatter: (value, ctx) => {
              const mode = this.labelMode();
              const label = this.renderLabels()[ctx.dataIndex] ?? ''; // ✅ 直接用 renderLabels
              const data = this.renderValues();
              const total = data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1) + '%';


              if (mode === 'none') return '';
              if (mode === 'percent') return percentage;
              if (mode === 'value') return value;
              return `${label}: ${value}`;
            },
          },
        },
      ],
    };
  }

  private buildChartOptions(): ChartConfiguration<'pie'>['options'] {
   return {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: this.theme() === 'dark' ? '#eee' : '#333',
            font: {
              size: 14,
            },
          },
        },
  
        title: {
          display: !!this.chartTitle(),
          text: this.chartTitle(),
          color: this.theme() === 'dark' ? '#eee' : '#333',
          font: { size: 20, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
      },
    };
  }
  


  trackByIndex(index: number): number {
    return index;
  }

  // 表單控制
  updateLabel(i: number, v: string) {
    const newLabels = [...this.labels()];
    newLabels[i] = v;
    this.labels.set(newLabels);
    this.updateSortedData();
  }

  updateValue(i: number, v: number) {
    const newValues = [...this.values()];
    newValues[i] = v;
    this.values.set(newValues);
    this.updateSortedData();

    // 若使用者修正錯誤值，動態清除錯誤標記
    const invalid = this.invalidIndices().filter(x => x !== i);
    if (v < 0) invalid.push(i);
    this.invalidIndices.set(invalid);
    this.hasError.set(invalid.length > 0);
  }

  updateTitle(v: string) {
    this.chartTitle.set(v);
  }


  addRow() {
    this.labels.set([...this.labels(), '新項目']);
    this.values.set([...this.values(), 0]);
    this.updateSortedData();
    this.recomputeInvalid();
  }

  removeRow(i: number) {
    this.labels.set(this.labels().filter((_, x) => x !== i));
    this.values.set(this.values().filter((_, x) => x !== i));
    this.updateSortedData();
    this.recomputeInvalid();
  }

  moveUp(i: number) {
    if (i === 0) return; // 第一個不能再上移
    const labels = [...this.labels()];
    const values = [...this.values()];

    [labels[i - 1], labels[i]] = [labels[i], labels[i - 1]];
    [values[i - 1], values[i]] = [values[i], values[i - 1]];

    this.labels.set(labels);
    this.values.set(values);
    this.updateSortedData();

    this.sortOrder.set('input');
    this.recomputeInvalid();
    this.flashRow(i);
    this.flashRow(i - 1);
  }

  moveDown(i: number) {
    const labels = [...this.labels()];
    const values = [...this.values()];
    if (i === labels.length - 1) return; // 最後一個不能再下移


    [labels[i], labels[i + 1]] = [labels[i + 1], labels[i]];
    [values[i], values[i + 1]] = [values[i + 1], values[i]];

    this.labels.set(labels);
    this.values.set(values);
    this.updateSortedData();

    this.sortOrder.set('input');
    this.recomputeInvalid();
    this.flashRow(i);
    this.flashRow(i + 1);
  }

  flashRow(index: number) {
    // 找到對應的 DOM 元素
    const rows = document.querySelectorAll('.item-row');
    const row = rows[index] as HTMLElement;
    if (!row) return;

    row.classList.add('moved');
    setTimeout(() => row.classList.remove('moved'), 600);
  }



  // === 新增驗證函式 ===
  validateValues(): boolean {
    const invalid: number[] = [];
    const vals = this.values();
    vals.forEach((v, i) => {
      if (v < 0 || isNaN(v)) invalid.push(i);
    });

    this.invalidIndices.set(invalid);
    const hasError = invalid.length > 0;
    this.hasError.set(hasError);
    return !hasError;
  }

  recomputeInvalid(): void {
    const invalid: number[] = [];
    this.values().forEach((v, i) => {
      if (v < 0 || isNaN(v)) invalid.push(i);
    });
    this.invalidIndices.set(invalid);
    this.hasError.set(invalid.length > 0);
  }

  async downloadChart(format: 'png' | 'jpg' = 'png') {
    if (!this.chartContainer) return;
    const canvas = await html2canvas(this.chartContainer.nativeElement, {
      backgroundColor: this.theme() === 'light' ? '#ffffff' : '#121212',
      scale: 2,
    });
    const link = document.createElement('a');

    switch (format) {
      case 'jpg':
        link.download = 'speed-pie.jpg';
        link.href = canvas.toDataURL('image/jpeg', 1.0);
        break;
      case 'png':
      default:
        link.download = 'speed-pie.png';
        link.href = canvas.toDataURL('image/png');
    }

    link.click();
  }



goToPreview() {
  if (!this.validateValues()) return;
  this.hasError.set(false);
  this.chartData = this.buildChartData();
  this.chartOptions = this.buildChartOptions();
  this.currentPage.set('preview');
}
 
  goToInput() {
    this.currentPage.set('input');
  }

  toggleTheme() {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
  }
}
