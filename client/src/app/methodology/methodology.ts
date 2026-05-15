import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-methodology',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule, MatCardModule, MatDividerModule],
  templateUrl: './methodology.html',
  styleUrl: './methodology.scss',
})
export class MethodologyComponent {}
