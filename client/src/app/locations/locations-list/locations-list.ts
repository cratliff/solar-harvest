import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Location, SOURCE_LABELS, LocationSource } from '../../models/location.model';

@Component({
  selector: 'app-locations-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatSelectModule, MatFormFieldModule, MatTableModule, MatPaginatorModule,
    MatProgressBarModule, MatChipsModule, MatIconModule, MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './locations-list.html',
  styleUrl: './locations-list.scss',
})
export class LocationsListComponent implements OnInit {
  private api = inject(ApiService);

  stateCtrl = new FormControl<string>('');
  cityCtrl = new FormControl<string>({ value: '', disabled: true });

  states: string[] = [];
  cities: string[] = [];
  locations: Location[] = [];
  nonprofitNames = new Map<string, string>();

  totalResults = 0;
  pageSize = 25;
  pageIndex = 0;
  loading = false;

  readonly columns = ['rank', 'org', 'address', 'source', 'score', 'savings', 'actions'];
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
      this.loadLocations();
    });

    this.cityCtrl.valueChanges.pipe(debounceTime(200), distinctUntilChanged()).subscribe(() => {
      this.pageIndex = 0;
      this.loadLocations();
    });

    this.loadLocations();
  }

  loadLocations() {
    this.loading = true;
    this.api
      .getLocations({
        state: this.stateCtrl.value || undefined,
        city: this.cityCtrl.value || undefined,
        page: this.pageIndex + 1,
        limit: this.pageSize,
      })
      .subscribe({
        next: res => {
          this.locations = res.results;
          this.totalResults = res.total;
          this.loading = false;
          this.prefetchNonprofitNames(res.results);
        },
        error: () => (this.loading = false),
      });
  }

  onPageChange(e: PageEvent) {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadLocations();
  }

  clearFilters() {
    this.stateCtrl.reset('');
    this.cityCtrl.reset('');
    this.pageIndex = 0;
  }

  private prefetchNonprofitNames(locs: Location[]) {
    const unique = [...new Set(locs.filter(l => !this.nonprofitNames.has(l.ein)).map(l => l.ein))];
    unique.forEach(ein => {
      this.api.getNonprofit(ein).subscribe(np => {
        if (np?.name) this.nonprofitNames.set(ein, np.name);
      });
    });
  }

  globalRank(localIndex: number): number {
    return this.pageIndex * this.pageSize + localIndex + 1;
  }

  scoreColor(score: number | undefined): string {
    if (score == null) return 'score-none';
    if (score >= 75) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
  }

  formatSavings(val: number | undefined): string {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  }

  sourceLabel(src: LocationSource): string {
    return SOURCE_LABELS[src] ?? src;
  }
}
