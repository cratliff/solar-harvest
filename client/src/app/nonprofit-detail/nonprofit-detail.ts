import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { switchMap } from 'rxjs/operators';
import { ApiService } from '../services/api.service';
import { BuildingLocation, Nonprofit, NTEE_LABELS, SOURCE_LABELS } from '../models/location.model';

const SUBSECTION_LABELS: Record<string, string> = {
  '03': '501(c)(3) Public Charity',
  '04': '501(c)(4) Social Welfare',
  '05': '501(c)(5) Labor/Agricultural',
  '06': '501(c)(6) Business League',
  '07': '501(c)(7) Social Club',
  '13': '501(c)(13) Cemetery',
  '19': '501(c)(19) Veterans Org',
};

@Component({
  selector: 'app-nonprofit-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule, MatDividerModule,
    MatProgressBarModule, MatTooltipModule, MatChipsModule,
  ],
  templateUrl: './nonprofit-detail.html',
  styleUrl: './nonprofit-detail.scss',
})
export class NonprofitDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api   = inject(ApiService);

  nonprofit: Nonprofit | null = null;
  locations: BuildingLocation[] = [];
  loadingOrg   = true;
  loadingLocs  = true;
  notFound     = false;

  readonly sourceLabels = SOURCE_LABELS;

  ngOnInit() {
    this.route.paramMap.pipe(
      switchMap(params => {
        const ein = params.get('ein')!;
        this.loadingOrg  = true;
        this.loadingLocs = true;
        return this.api.getNonprofit(ein);
      }),
    ).subscribe({
      next: org => { this.nonprofit = org; this.loadingOrg = false; },
      error: () => { this.notFound = true; this.loadingOrg = false; },
    });

    this.route.paramMap.pipe(
      switchMap(params => this.api.getNonprofitLocations(params.get('ein')!)),
    ).subscribe({
      next: locs => { this.locations = locs; this.loadingLocs = false; },
      error: () => { this.loadingLocs = false; },
    });
  }

  formatCurrency(val?: number): string {
    if (val == null || !isFinite(val)) return '—';
    if (Math.abs(val) >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(val) >= 1_000)     return '$' + (val / 1_000).toFixed(0) + 'K';
    return '$' + val.toFixed(0);
  }

  formatKwh(val?: number): string {
    if (val == null || !isFinite(val)) return '—';
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
    if (val >= 1_000)     return (val / 1_000).toFixed(0) + 'K';
    return val.toFixed(0);
  }

  scoreColor(score: number): string {
    if (score >= 70) return 'score--high';
    if (score >= 40) return 'score--mid';
    return 'score--low';
  }

  nteeLabel(code?: string): string {
    if (!code) return 'Unknown';
    return NTEE_LABELS[code[0]] ?? 'Unknown';
  }

  subsectionLabel(code?: string): string {
    if (!code) return '';
    return SUBSECTION_LABELS[code] ?? `501(c) Code ${code}`;
  }

  sourceLabel(source: string): string {
    return SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] ?? source;
  }

  buildingAddress(b: BuildingLocation): string {
    const a = b.address;
    if (!a) return '—';
    const parts = [a.street, a.city, a.state, a.zip].filter(Boolean);
    return parts.join(', ') || '—';
  }

  taxPeriodLabel(period?: string): string {
    if (!period || period.length !== 6) return period ?? '—';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const m = parseInt(period.slice(4), 10);
    const y = period.slice(0, 4);
    return `${months[m - 1] ?? ''} ${y}`;
  }

  get bestScoredBuilding(): BuildingLocation | null {
    return this.locations.find(l => l.solarBenefitScore != null) ?? null;
  }

  get totalKwhYear(): number {
    return this.locations.reduce((sum, l) => sum + (l.sunroof?.solarPotentialKwhYear ?? 0), 0);
  }

  get totalSavings(): number {
    return this.locations.reduce((sum, l) => sum + (l.estimatedAnnualSavings ?? 0), 0);
  }
}
