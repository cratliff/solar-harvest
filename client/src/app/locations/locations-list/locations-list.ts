import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Nonprofit, NTEE_LABELS, SOURCE_LABELS } from '../../models/location.model';

@Component({
  selector: 'app-locations-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatSelectModule, MatFormFieldModule, MatTableModule, MatPaginatorModule,
    MatProgressBarModule, MatIconModule, MatButtonModule, MatTooltipModule,
  ],
  templateUrl: './locations-list.html',
  styleUrl: './locations-list.scss',
})
export class LocationsListComponent implements OnInit {
  private api    = inject(ApiService);
  private router = inject(Router);

  stateCtrl = new FormControl<string>('');
  cityCtrl  = new FormControl<string>({ value: '', disabled: true });

  states: string[] = [];
  cities: string[] = [];
  nonprofits: Nonprofit[] = [];

  totalResults = 0;
  pageSize     = 25;
  pageIndex    = 0;
  loading      = false;

  readonly columns = ['rank', 'name', 'address', 'ntee', 'assets', 'score', 'savings'];
  readonly sourceLabels = SOURCE_LABELS;

  ngOnInit() {
    this.api.getStates().subscribe(s => (this.states = s));

    this.stateCtrl.valueChanges.subscribe(state => {
      this.cityCtrl.reset('');
      this.cities = [];
      this.pageIndex = 0;
      if (state) {
        this.cityCtrl.enable();
        this.api.getCities(state).subscribe(c => (this.cities = c));
      } else {
        this.cityCtrl.disable();
      }
      this.load();
    });

    this.cityCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe(() => { this.pageIndex = 0; this.load(); });

    this.load();
  }

  load() {
    this.loading = true;
    this.api.getNonprofits({
      state: this.stateCtrl.value || undefined,
      city:  this.cityCtrl.value  || undefined,
      page:  this.pageIndex + 1,
      limit: this.pageSize,
    }).subscribe({
      next: res => {
        this.nonprofits   = res.results;
        this.totalResults = res.total;
        this.loading      = false;
      },
      error: () => (this.loading = false),
    });
  }

  onPageChange(e: PageEvent) {
    this.pageIndex = e.pageIndex;
    this.pageSize  = e.pageSize;
    this.load();
  }

  clearFilters() {
    this.stateCtrl.reset('');
    this.cityCtrl.reset('');
    this.pageIndex = 0;
  }

  navigateToDetail(ein: string) {
    this.router.navigate(['/nonprofit', ein]);
  }

  globalRank(i: number): number {
    return this.pageIndex * this.pageSize + i + 1;
  }

  nteeLabel(code: string | undefined): string {
    if (!code) return '—';
    return NTEE_LABELS[code.charAt(0).toUpperCase()] ?? code;
  }

  scoreColor(score: number | null | undefined): string {
    if (score == null) return 'score-none';
    if (score >= 70) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
  }

  formatCurrency(val: number | null | undefined): string {
    if (val == null || !isFinite(val)) return '—';
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (val >= 1_000)     return '$' + (val / 1_000).toFixed(0) + 'K';
    return '$' + val.toFixed(0);
  }

  formatKwh(val: number | null | undefined): string {
    if (val == null || !isFinite(val)) return '—';
    return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
}
