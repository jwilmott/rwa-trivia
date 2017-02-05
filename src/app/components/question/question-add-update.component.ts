import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray, FormControl } from '@angular/forms';
import { Router } from '@angular/router';

import { Category, Question }     from '../../model';
import { CategoryService, TagService, QuestionService } from '../../services';

@Component({
  templateUrl: './question-add-update.component.html',
  styleUrls: ['./question-add-update.component.scss']
})
export class QuestionAddUpdateComponent implements OnInit, OnDestroy {

  //Properties
  categories: Category[];
  sub: any;

  tags: string[];
  sub2: any;

  questionForm: FormGroup;
  question: Question;
  
  autoTags: string[] = []; //auto computed based on match within Q/A
  enteredTags: string[] = [];

  get answers(): FormArray { 
    return this.questionForm.get('answers') as FormArray; 
  }

  //Constructor
  constructor(private fb: FormBuilder,
              private router: Router,
              private categoryService: CategoryService,
              private tagService: TagService,
              private questionService: QuestionService) {
  }

  //Lifecycle hooks
  ngOnInit() {
    this.question = new Question();
    this.createForm(this.question);

    let questionControl = this.questionForm.get('questionText');

    questionControl.valueChanges.debounceTime(500).subscribe(v => this.computeAutoTags());
    this.answers.valueChanges.debounceTime(500).subscribe(v => this.computeAutoTags());

    this.sub = this.categoryService.getCategories()
                   .subscribe(categories => this.categories = categories);

    this.sub2 = this.tagService.getTags()
                   .subscribe(tags => this.tags = tags);
  }

  ngOnDestroy() {
    if (this.sub)
      this.sub.unsubscribe();
    if (this.sub2)
      this.sub2.unsubscribe();
  }

  //Event Handlers
  addTag() {
    let tag = this.questionForm.get('tags').value;
    if (tag) {
      if (this.enteredTags.indexOf(tag) < 0)
        this.enteredTags.push(tag);
      this.questionForm.get('tags').setValue('');
    }
  }
  removeEnteredTag(tag) {
    this.enteredTags = this.enteredTags.filter(t => t !== tag); 
  }
  onSubmit() {
    //validations
    if (this.questionForm.invalid)
      return;

    //get question object from the forms
    let question: Question = this.getQuestionFromFormValue(this.questionForm.value);

    //call saveQuestion
    this.saveQuestion(question);
  }
  
  //Helper functions
  getQuestionFromFormValue(formValue: any): Question {
    let question: Question;

    question = new Question();
    question.questionText = formValue.questionText;
    question.answers = formValue.answers;
    question.categoryIds = [formValue.category];
    question.tags = [...this.autoTags, ...this.enteredTags]

    return question;
  }

  saveQuestion(question: Question) {
    console.log("saveQuestion");
    this.questionService.saveQuestion(question).subscribe(response => {
      console.log("navigating ...");
      this.router.navigate(['/questions']);
    });
  }

  computeAutoTags() {
    let formValue = this.questionForm.value;

    let allTextValues: string[] = [formValue.questionText];
    formValue.answers.forEach(answer => allTextValues.push(answer.answerText));

    let wordString: string = allTextValues.join(" ");

    let matchingTags: string[] = [];
    this.tags.forEach(tag => {
      let patt = new RegExp('\\b(' + tag.replace("+", "\\+") + ')\\b', "ig");
      if (wordString.match(patt))
        matchingTags.push(tag);
    });
    this.autoTags = matchingTags;
  }

  createForm(question: Question) {

    let fgs:FormGroup[] = question.answers.map(answer => {
      let fg = new FormGroup({
        answerText: new FormControl(answer.answerText, Validators.required),
        correct: new FormControl(answer.correct),
      });
      return fg;
    });
    let answersFA = new FormArray(fgs);

    let fcs:FormControl[] = question.tags.map(tag => {
      let fc = new FormControl(tag);
      return fc;
    });
    if (fcs.length == 0)
      fcs = [new FormControl('')];
    let tagsFA = new FormArray(fcs);

    this.questionForm = this.fb.group({
      category: [(question.categories.length>0? question.categories[0] : ''), Validators.required],
      questionText: [question.questionText, Validators.required],
      tags: '',
      tagsArray: tagsFA,
      answers: answersFA,
      ordered: [question.ordered],
      explanation: [question.explanation]

    })
  }

}
