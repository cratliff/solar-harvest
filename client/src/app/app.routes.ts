import { Routes } from '@angular/router';
import { LocationsListComponent } from './locations/locations-list/locations-list';
import { MethodologyComponent } from './methodology/methodology';

export const routes: Routes = [
  { path: '',            component: LocationsListComponent },
  { path: 'methodology', component: MethodologyComponent },
  { path: '**',          redirectTo: '' },
];
