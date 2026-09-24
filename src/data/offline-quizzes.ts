import type { OfflineQuizQuestion } from "@/services/offline-learning.service";

export const offlineQuizQuestions: OfflineQuizQuestion[] = [
  {
    id: "mathematics-1-q1",
    lessonId: "mathematics-1",
    topic: "Linear equations",
    question: "What is the solution of 3x + 7 = 22?",
    options: ["x = 3", "x = 5", "x = 7", "x = 9"],
    correctAnswer: "x = 5",
    explanation: "Subtract 7 to get 3x = 15, then divide by 3 to get x = 5.",
  },
  {
    id: "mathematics-2-q1",
    lessonId: "mathematics-2",
    topic: "Quadratic equations",
    question: "For a quadratic equation, what does a negative discriminant mean?",
    options: ["Two distinct real roots", "One repeated root", "No real roots", "The equation is linear"],
    correctAnswer: "No real roots",
    explanation: "When b² - 4ac is less than zero, the quadratic has no real roots.",
  },
  {
    id: "physics-1-q1",
    lessonId: "physics-1",
    topic: "Motion",
    question: "Which quantity describes how quickly an object changes position?",
    options: ["Mass", "Velocity", "Density", "Temperature"],
    correctAnswer: "Velocity",
    explanation: "Velocity describes the rate and direction of change of position.",
  },
  {
    id: "biology-1-q1",
    lessonId: "biology-1",
    topic: "Cells",
    question: "What is the basic structural unit of a living organism?",
    options: ["Organ", "Tissue", "Cell", "System"],
    correctAnswer: "Cell",
    explanation: "Cells are the basic structural and functional units of living organisms.",
  },
  {
    id: "english-1-q1",
    lessonId: "english-1",
    topic: "Grammar",
    question: "Which word is a noun in this sentence: 'The bright student reads.'?",
    options: ["The", "bright", "student", "reads"],
    correctAnswer: "student",
    explanation: "Student names a person, so it is the noun in the sentence.",
  },
  {
    id: "hindi-1-q1",
    lessonId: "hindi-1",
    topic: "संज्ञा",
    question: "'गंगा' किस प्रकार की संज्ञा है?",
    options: ["व्यक्तिवाचक", "भाववाचक", "समूहवाचक", "द्रव्यवाचक"],
    correctAnswer: "व्यक्तिवाचक",
    explanation: "गंगा एक विशेष नदी का नाम है, इसलिए यह व्यक्तिवाचक संज्ञा है।",
  },
];

export function questionsForLesson(lessonId: string): OfflineQuizQuestion[] {
  return offlineQuizQuestions.filter((question) => question.lessonId === lessonId);
}
