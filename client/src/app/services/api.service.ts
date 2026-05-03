import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Location, LocationsResponse, Nonprofit } from '../models/location.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api';

  getStates(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/locations/states`);
  }

  getCities(state: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/locations/cities`, {
      params: new HttpParams().set('state', state),
    });
  }

  getLocations(filters: {
    state?: string;
    city?: string;
    page?: number;
    limit?: number;
  }): Observable<LocationsResponse> {
    let params = new HttpParams();
    if (filters.state) params = params.set('state', filters.state);
    if (filters.city) params = params.set('city', filters.city);
    if (filters.page) params = params.set('page', filters.page);
    if (filters.limit) params = params.set('limit', filters.limit);
    return this.http.get<LocationsResponse>(`${this.base}/locations`, { params });
  }

  getNonprofit(ein: string): Observable<Nonprofit> {
    return this.http.get<Nonprofit>(`${this.base}/nonprofits/${ein}`);
  }

  triggerEnrich(ein: string): Observable<unknown> {
    return this.http.post(`${this.base}/nonprofits/${ein}/enrich`, {});
  }
}
