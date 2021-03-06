import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { FormBuilder, FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { select, Store } from '@ngrx/store';
import { AutoUnsubscribe } from 'ngx-auto-unsubscribe';
import { CropperSettings, ImageCropperComponent } from 'ngx-img-cropper';
import { Utils, WindowRef } from 'shared-library/core/services';
import { coreState, UserActions } from 'shared-library/core/store';
import { profileSettingsConstants } from 'shared-library/shared/model';
import { AppState } from '../../../store';
import { ProfileSettings } from './profile-settings';

@Component({
  selector: 'profile-settings',
  templateUrl: './profile-settings.component.html',
  styleUrls: ['./profile-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})

@AutoUnsubscribe({'arrayName': 'subscriptions'})
export class ProfileSettingsComponent extends ProfileSettings implements OnDestroy {

  @ViewChild('cropper') cropper: ImageCropperComponent;
  // Properties
  cropperSettings: CropperSettings;
  notificationMsg: string;
  errorStatus: boolean;
  subscriptions = [];

  constructor(public fb: FormBuilder,
    public store: Store<AppState>,
    private windowRef: WindowRef,
    public userAction: UserActions,
    public cd: ChangeDetectorRef,
    public utils: Utils,
    public route: ActivatedRoute) {

    super(fb, store, userAction, utils, cd, route);

    // if (this.userType === 0) {
      this.setCropperSettings();
      this.setNotificationMsg('', false, 0);

      this.subscriptions.push(this.store.select(coreState).pipe(select(s => s.userProfileSaveStatus)).subscribe(status => {
        if (status === 'SUCCESS') {
          this.setNotificationMsg('Profile Saved !', false, 100);
          this.cd.markForCheck();
        }
      }));
    // }
  }

  setNotificationMsg(msg: string, flag: boolean, scrollPosition: number): void {
    this.notificationMsg = msg;
    this.errorStatus = flag;
    if (this.windowRef.nativeWindow.scrollTo) {
      this.windowRef.nativeWindow.scrollTo(0, scrollPosition);
    }
  }


  private setCropperSettings() {
    this.cropperSettings = new CropperSettings();
    this.cropperSettings.noFileInput = true;
    this.cropperSettings.width = 150;
    this.cropperSettings.height = 140;
    this.cropperSettings.croppedWidth = 150;
    this.cropperSettings.croppedHeight = 140;
    this.cropperSettings.canvasWidth = 300;
    this.cropperSettings.canvasHeight = 280;
    this.cropperSettings.minWidth = 10;
    this.cropperSettings.minHeight = 10;
    this.cropperSettings.rounded = false;
    this.cropperSettings.keepAspect = false;
    this.cropperSettings.cropperDrawSettings.strokeColor = 'rgba(255,255,255,1)';
    this.cropperSettings.cropperDrawSettings.strokeWidth = 2;
  }

  onFileChange($event) {
    this.validateImage($event.target.files);
    if (!this.profileImageValidation) {
      const image = new Image();
      this.profileImageFile = $event.target.files[0];
      const reader: FileReader = new FileReader();
      reader.readAsDataURL(this.profileImageFile);
      reader.onloadend = (loadEvent: any) => {
        image.src = loadEvent.target.result;
        this.user.originalImageUrl = image.src;
        this.cropper.setImage(image);
      };
    }
  }

  validateImage(fileList: FileList) {
    if (fileList.length === 0) {
      this.profileImageValidation = 'Please select Profile picture';
    } else {
      const file: File = fileList[0];
      const fileName = file.name;
      const fileSize = file.size;
      const fileType = file.type;

      if (fileSize > 2097152) {
        this.profileImageValidation = 'Your uploaded Profile is not larger than 2 MB.';
      } else {
        if (fileType === 'image/jpeg' || fileType === 'image/jpg' || fileType === 'image/png' || fileType === 'image/gif') {
          this.profileImageValidation = undefined;
        } else {
          this.profileImageValidation = 'Only PNG, GIF, JPG and JPEG Type Allow.';
        }
      }
    }
  }

  saveProfileImage() {
    if (!this.profileImageValidation) {
      this.enableForm();
      this.getUserFromFormValue(false, '');
      this.disableForm();
      this.assignImageValues();
      this.saveUser(this.user);
      this.cd.markForCheck();
    }
  }

  assignImageValues(): void {
    const fileName = `${new Date().getTime()}-${this.profileImageFile.name}`;
    this.user.profilePicture = fileName;
    this.user.croppedImageUrl = this.profileImage.image;
    this.user.imageType = this.profileImageFile.type;
    this.profileImageFile = undefined;
    this.userForm.get('profilePicture').setValue(fileName);
    this.userForm.updateValueAndValidity();
  }

  setBulkUploadRequest(checkStatus: boolean): void {
    const userForm = this.userForm.value;
    if (!userForm.name || !userForm.displayName || !userForm.location || !userForm.profilePicture) {
      this.setNotificationMsg('Please add name, display name, location and profile picture for bulk upload request', true, 100);
    } else {
      this.user.bulkUploadPermissionStatus = profileSettingsConstants.NONE;
      this.onSubmit();
    }

  }

  // tags start
  // Event Handlers
  addTag() {
    const tag = this.userForm.get('tags').value;
    if (tag) {
      if (this.enteredTags.indexOf(tag) < 0) {
        this.enteredTags.push(tag);
      }
      this.userForm.get('tags').setValue('');
    }
    this.setTagsArray();
  }

  removeEnteredTag(tag) {
    this.enteredTags = this.enteredTags.filter(t => t !== tag);
    this.setTagsArray();
  }

  setTagsArray() {
    this.tagsArray.controls = [];
    this.enteredTags.forEach(tag => this.tagsArray.push(new FormControl(tag)));
  }
  // tags end

  onSubmit(isEditSingleField = false, field = '') {
    // validations
    this.userForm.updateValueAndValidity();

    if (this.profileImageFile) {
      this.assignImageValues();
    }
    // validate for main form except single edit field
    if (this.userForm.invalid && !isEditSingleField) {

      const controls = this.userForm.controls;
      const singleEditFields = Object.getOwnPropertyNames(this.singleFieldEdit);
      for (const name in controls) {
          if (controls[name].invalid &&  singleEditFields.indexOf(name) < 0) {
            this.setNotificationMsg('Please fill the mandatory fields', true, 100);
            return;
          }
      }
    }


    // get user object from the forms
    this.getUserFromFormValue(isEditSingleField, field);
    if (isEditSingleField) {
      this.userForm.get(field).disable();
      this.singleFieldEdit[field] = false;
    }
    // call saveUser
    this.saveUser(this.user);
    this.setNotificationMsg('', false, 0);
    this.cd.markForCheck();
  }

  ngOnDestroy() {

  }

}
