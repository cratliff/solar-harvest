import { Routes } from '@angular/router';
import { LocationsListComponent } from './locations/locations-list/locations-list';

export const routes: Routes = [
  { path: '', component: LocationsListComponent },
  { path: '**', redirectTo: '' },
];
