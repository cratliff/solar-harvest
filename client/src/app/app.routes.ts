import { Routes } from '@angular/router';
import { LocationsListComponent } from './locations/locations-list/locations-list';
import { MethodologyComponent } from './methodology/methodology';
import { NonprofitDetailComponent } from './nonprofit-detail/nonprofit-detail';

export const routes: Routes = [
  { path: '',               component: LocationsListComponent },
  { path: 'nonprofit/:ein', component: NonprofitDetailComponent },
  { path: 'methodology',    component: MethodologyComponent },
  { path: '**',             redirectTo: '' },
];
