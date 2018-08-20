import { NgModule } from '@angular/core';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';

import { SharedModule } from '../../../../shared-library/src/public_api';
import { BulkRoutingModule } from './routing/bulk-routing.module';
import { effects, reducer } from './store';

import {
  BulkSummaryTableComponent, BulkSummaryQuestionComponent
} from './components';
import { PapaParseModule } from 'ngx-papaparse';


@NgModule({
  declarations: [
    BulkSummaryTableComponent,
    BulkSummaryQuestionComponent
  ],
  imports: [
    SharedModule,
    BulkRoutingModule,

    //ngrx feature store
    StoreModule.forFeature('bulk', reducer),

    //  //ngrx effects
    EffectsModule.forFeature(effects),
    PapaParseModule
  ],
  exports: [BulkSummaryTableComponent, BulkSummaryQuestionComponent]
})
export class BulkModule { }
