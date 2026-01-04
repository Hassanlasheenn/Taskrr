import { Component, Input, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ICard } from "../../interfaces";

@Component({
    selector: 'app-card',
    templateUrl: './card.component.html',
    styleUrls: ['./card.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class CardComponent implements OnInit {
    @Input() card: ICard = { title: 'Title' };

    constructor() {}
    ngOnInit() {
        console.log('CardComponent');
    }
}