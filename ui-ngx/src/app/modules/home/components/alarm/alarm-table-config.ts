///
/// Copyright © 2016-2023 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import {
  CellActionDescriptorType,
  DateEntityTableColumn,
  EntityTableColumn,
  EntityTableConfig
} from '@home/models/entity/entities-table-config.models';
import { EntityType, EntityTypeResource, entityTypeTranslations } from '@shared/models/entity-type.models';
import { TranslateService } from '@ngx-translate/core';
import { DatePipe } from '@angular/common';
import { Direction } from '@shared/models/page/sort-order';
import { MatDialog } from '@angular/material/dialog';
import { TimePageLink } from '@shared/models/page/page-link';
import { Observable } from 'rxjs';
import { PageData } from '@shared/models/page/page-data';
import { EntityId } from '@shared/models/id/entity-id';
import {
  AlarmInfo,
  AlarmQuery,
  AlarmSearchStatus,
  alarmSeverityColors,
  alarmSeverityTranslations,
  alarmStatusTranslations
} from '@app/shared/models/alarm.models';
import { AlarmService } from '@app/core/http/alarm.service';
import { DialogService } from '@core/services/dialog.service';
import { AlarmTableHeaderComponent } from '@home/components/alarm/alarm-table-header.component';
import {
  AlarmDetailsDialogComponent,
  AlarmDetailsDialogData
} from '@home/components/alarm/alarm-details-dialog.component';
import { DAY, historyInterval } from '@shared/models/time/time.models';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { getCurrentAuthUser } from '@core/auth/auth.selectors';
import { Authority } from '@shared/models/authority.enum';
import { ChangeDetectorRef, Injector, StaticProvider, ViewContainerRef } from '@angular/core';
import { ConnectedPosition, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import {
  ALARM_ASSIGNEE_PANEL_DATA, AlarmAssigneePanelComponent,
  AlarmAssigneePanelData
} from '@home/components/alarm/alarm-assignee-panel.component';
import { ComponentPortal } from '@angular/cdk/portal';
import { isDefinedAndNotNull } from '@core/utils';
import { UtilsService } from '@core/services/utils.service';

export class AlarmTableConfig extends EntityTableConfig<AlarmInfo, TimePageLink> {

  private authUser = getCurrentAuthUser(this.store);

  searchStatus: AlarmSearchStatus;

  constructor(private alarmService: AlarmService,
              private dialogService: DialogService,
              private translate: TranslateService,
              private datePipe: DatePipe,
              private dialog: MatDialog,
              public entityId: EntityId = null,
              private defaultSearchStatus: AlarmSearchStatus = AlarmSearchStatus.ANY,
              private store: Store<AppState>,
              private viewContainerRef: ViewContainerRef,
              private overlay: Overlay,
              private cd: ChangeDetectorRef,
              private utilsService: UtilsService) {
    super();
    this.loadDataOnInit = false;
    this.tableTitle = '';
    this.useTimePageLink = true;
    this.pageMode = false;
    this.defaultTimewindowInterval = historyInterval(DAY * 30);
    this.detailsPanelEnabled = false;
    this.selectionEnabled = false;
    this.searchEnabled = true;
    this.addEnabled = false;
    this.entitiesDeleteEnabled = false;
    this.actionsColumnTitle = 'alarm.details';
    this.entityType = EntityType.ALARM;
    this.entityTranslations = entityTypeTranslations.get(EntityType.ALARM);
    this.entityResources = {
    } as EntityTypeResource<AlarmInfo>;
    this.searchStatus = defaultSearchStatus;

    this.headerComponent = AlarmTableHeaderComponent;

    this.entitiesFetchFunction = pageLink => this.fetchAlarms(pageLink);

    this.defaultSortOrder = {property: 'createdTime', direction: Direction.DESC};

    this.columns.push(
      new DateEntityTableColumn<AlarmInfo>('createdTime', 'alarm.created-time', this.datePipe, '150px'));
    this.columns.push(
      new EntityTableColumn<AlarmInfo>('originatorName', 'alarm.originator', '25%',
        (entity) => entity.originatorName, entity => ({}), false));
    this.columns.push(
      new EntityTableColumn<AlarmInfo>('type', 'alarm.type', '25%'));
    this.columns.push(
      new EntityTableColumn<AlarmInfo>('severity', 'alarm.severity', '25%',
        (entity) => this.translate.instant(alarmSeverityTranslations.get(entity.severity)),
        entity => ({
          fontWeight: 'bold',
          color: alarmSeverityColors.get(entity.severity)
        })));
    this.columns.push(
      new EntityTableColumn<AlarmInfo>('assigneeEmail', 'alarm.assignee', '200px',
        (entity) => {
          return this.getAssigneeTemplate(entity)
        },
        (entity) => {
          return {
            display: 'flex',
            justifyContent: 'start',
            alignItems: 'center',
            height: 'inherit'
          }
        },
        false,
        () => ({}),
        (entity) => undefined,
        false,
        {
          icon: 'keyboard_arrow_down',
          type: CellActionDescriptorType.DEFAULT,
          isEnabled: (entity) => true,
          name: this.translate.instant('alarm.assign'),
          onAction: ($event, entity) => this.openAlarmAssigneePanel($event, entity)
        })
    )
    this.columns.push(
      new EntityTableColumn<AlarmInfo>('status', 'alarm.status', '25%',
        (entity) => this.translate.instant(alarmStatusTranslations.get(entity.status))));

    this.cellActionDescriptors.push(
      {
        name: this.translate.instant('alarm.details'),
        icon: 'more_horiz',
        isEnabled: () => true,
        onAction: ($event, entity) => this.showAlarmDetails(entity)
      }
    );
  }

  fetchAlarms(pageLink: TimePageLink): Observable<PageData<AlarmInfo>> {
    const query = new AlarmQuery(this.entityId, pageLink, this.searchStatus, null, null, true);
    return this.alarmService.getAlarms(query);
  }

  showAlarmDetails(entity: AlarmInfo) {
    const isPermissionWrite = this.authUser.authority !== Authority.CUSTOMER_USER || entity.customerId.id === this.authUser.customerId;
    this.dialog.open<AlarmDetailsDialogComponent, AlarmDetailsDialogData, boolean>
    (AlarmDetailsDialogComponent,
      {
        disableClose: true,
        panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
        data: {
          alarmId: entity.id.id,
          alarm: entity,
          allowAcknowledgment: isPermissionWrite,
          allowClear: isPermissionWrite,
          displayDetails: true
        }
      }).afterClosed().subscribe(
      (res) => {
        if (res) {
          this.updateData();
        }
      }
    );
  }

  getAssigneeTemplate(entity: AlarmInfo): string {
    return `
      <span class="assignee-cell">
      ${isDefinedAndNotNull(entity.assigneeId) ?
        `<span class="assigned-container">
          <span class="user-avatar" style="background-color: ${this.getAvatarBgColor(entity)}">
            ${this.getUserInitials(entity)}
          </span>
          <span>${this.getUserDisplayName(entity)}</span>
        </span>`
        :
        `<mat-icon class="material-icons unassigned-icon">account_circle</mat-icon>
        <span>${this.translate.instant('alarm.unassigned')}</span>`
      }
      </span>`
  }

  getUserDisplayName(entity: AlarmInfo) {
    let displayName = '';
    if ((entity.assigneeFirstName && entity.assigneeFirstName.length > 0) ||
      (entity.assigneeLastName && entity.assigneeLastName.length > 0)) {
      if (entity.assigneeFirstName) {
        displayName += entity.assigneeFirstName;
      }
      if (entity.assigneeLastName) {
        if (displayName.length > 0) {
          displayName += ' ';
        }
        displayName += entity.assigneeLastName;
      }
    } else {
      displayName = entity.assigneeEmail;
    }
    return displayName;
  }

  getUserInitials(entity: AlarmInfo): string {
    let initials = '';
    if (entity.assigneeFirstName && entity.assigneeFirstName.length ||
      entity.assigneeLastName && entity.assigneeLastName.length) {
      if (entity.assigneeFirstName) {
        initials += entity.assigneeFirstName.charAt(0);
      }
      if (entity.assigneeLastName) {
        initials += entity.assigneeLastName.charAt(0);
      }
    } else {
      initials += entity.assigneeEmail.charAt(0);
    }
    return initials.toUpperCase();
  }

  getAvatarBgColor(entity: AlarmInfo) {
    return this.utilsService.stringToHslColor(this.getUserDisplayName(entity), 40, 60);
  }

  openAlarmAssigneePanel($event: Event, entity: AlarmInfo) {
    if ($event) {
      $event.stopPropagation();
    }
    const target = $event.target || $event.srcElement || $event.currentTarget;
    const config = new OverlayConfig();
    config.backdropClass = 'cdk-overlay-transparent-backdrop';
    config.hasBackdrop = true;
    const connectedPosition: ConnectedPosition = {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'center',
      overlayY: 'top'
    };
    config.positionStrategy = this.overlay.position().flexibleConnectedTo(target as HTMLElement)
      .withPositions([connectedPosition]);
    config.minWidth = '260px';
    const overlayRef = this.overlay.create(config);
    overlayRef.backdropClick().subscribe(() => {
      overlayRef.dispose();
    });
    const providers: StaticProvider[] = [
      {
        provide: ALARM_ASSIGNEE_PANEL_DATA,
        useValue: {
          alarmId: entity.id.id,
          assigneeId: entity.assigneeId?.id
        } as AlarmAssigneePanelData
      },
      {
        provide: OverlayRef,
        useValue: overlayRef
      }
    ];
    const injector = Injector.create({parent: this.viewContainerRef.injector, providers});
    overlayRef.attach(new ComponentPortal(AlarmAssigneePanelComponent,
      this.viewContainerRef, injector)).onDestroy(() => this.updateData());
  }

}
