import { Routes } from '@angular/router';
import { LocationsListComponent } from './locations/locations-list/locations-list';
import { MethodologyComponent } from './methodology/methodology';
import { NonprofitDetailComponent } from './nonprofit-detail/nonprofit-detail';
import { AboutComponent } from './about/about';

export const routes: Routes = [
  { path: '',               component: LocationsListComponent },
  { path: 'nonprofit/:ein', component: NonprofitDetailComponent },
  { path: 'about',          component: AboutComponent },
  { path: 'methodology',    component: MethodologyComponent },
  { path: '**',             redirectTo: '' },
];
