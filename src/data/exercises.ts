import type { Exercise, Routine, RoutineDay, RoutineExercise } from '../types'

const progression = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const cues = ['Set your position and brace before the first rep.', 'Move with control; avoid momentum.', 'Use a comfortable range and keep the target muscle engaged.']
const catalog: Record<string, Record<string, string[]>> = {
  Back: {
    'Lats & Upper Back': ['Machine Lat Pulldown', 'Assisted Pull-Up', 'Wide-Grip Lat Pulldown', 'Wide-Grip Pull-Up'],
    'Lats & Mid Back': ['Chest-Supported Dumbbell Row', 'V-Bar Cable Row', 'Single-Arm Cable Row', 'Single-Arm Cable Row (Strict)'],
    'Isolate Upper Back': ['Machine High Row', 'Chest-Supported Dumbbell High Row', 'Wide-Grip Cable Row', 'Chest-Supported T-Bar Row'],
    'Isolate the Lats': ['Dumbbell Lat Pullover', 'Cable Rope Pullover', 'Cable Straight-Bar Pullover', 'Incline Cable Pullover'],
    Traps: ['Standing Dumbbell Shrugs', 'Incline Dumbbell Shrugs', 'Smith Machine Shrug', 'Cable Shrug'],
    'Rear Delts': ['Rear Delt Raise', 'Chest-Supported Reverse Fly', 'Reverse Pec Deck', 'Cable Rear Delt Fly'],
  },
  Chest: {
    'Upper Chest': ['Incline Push-Up', 'Incline Dumbbell Press', 'Incline Barbell Press', 'Incline Smith Press'],
    'Mid Chest': ['Machine Chest Press', 'Dumbbell Bench Press', 'Barbell Bench Press', 'Paused Bench Press'],
    'Lower Chest': ['High-to-Low Cable Fly', 'Decline Dumbbell Press', 'Decline Barbell Bench Press', 'Weighted Chest Dip'],
  },
  Shoulders: { 'Side Delts': ['Cable Lateral Raise', 'Dumbbell Lateral Raise', 'Lean-Away Cable Raise', 'Partial Lateral Raise'], 'Rear Delts': ['Reverse Pec Deck', 'Cable Rear Delt Fly', 'Face Pull', 'Bent-Over Rear Delt Row'] },
  Arms: { Biceps: ['Cable Curl', 'Dumbbell Curl', 'Barbell Curl', 'Strict Preacher Curl'], Triceps: ['Cable Pushdown', 'Overhead Rope Extension', 'Close-Grip Bench Press', 'Weighted Dip'] },
  Legs: { Quads: ['Goblet Squat', 'Leg Press', 'Front Squat', 'High-Bar Back Squat'], Hamstrings: ['Seated Leg Curl', 'Romanian Deadlift', 'Good Morning', 'Nordic Curl'], Glutes: ['Glute Bridge', 'Hip Thrust', 'Barbell Hip Thrust', 'Single-Leg Hip Thrust'], Calves: ['Standing Calf Raise', 'Seated Calf Raise', 'Leg Press Calf Raise', 'Single-Leg Calf Raise'] },
  Core: { Abs: ['Dead Bug', 'Cable Crunch', 'Hanging Knee Raise', 'Dragon Flag'] },
}
const equipment = (name: string) => /cable|pulldown|pec deck|machine|leg press/i.test(name) ? 'Machine / cable' : /dumbbell/i.test(name) ? 'Dumbbell' : /barbell|smith|bench press|good morning/i.test(name) ? 'Barbell' : /pull-up|dip|push-up|dragon flag|dead bug|nordic/i.test(name) ? 'Bodyweight' : 'Free weights'
export const exercises: Exercise[] = Object.entries(catalog).flatMap(([group, muscles]) => Object.entries(muscles).flatMap(([muscle, names]) => names.map((name, i) => ({ name, group, muscle, level: progression[i], equipment: equipment(name), cues }))))
export const groups = Object.entries(catalog).map(([name, muscles]) => ({ name, muscles: Object.keys(muscles), count: Object.values(muscles).flat().length }))
export const levelNames = progression

const day = (name: string, focus: string, muscleNames: string[]): RoutineDay => ({ id: crypto.randomUUID(), name, focus, exercises: muscleNames.flatMap((muscle) => { const x = exercises.find((exercise) => exercise.muscle === muscle); return x ? [{ name: x.name, muscle: x.muscle, group: x.group, sets: 3, reps: '8–12', rest: 90 }] : [] }) })
const restDay = (name: string): RoutineDay => ({ id: crypto.randomUUID(), name, focus: 'Recovery', rest: true, exercises: [] })
export const starterRoutines: Routine[] = [
  { id: 'full-body', name: 'Full Body · Beginner', days: [day('Monday · Full Body', 'Full body', ['Mid Chest', 'Lats & Upper Back', 'Quads', 'Hamstrings', 'Triceps']), restDay('Tuesday · Recovery'), day('Wednesday · Full Body', 'Full body', ['Upper Chest', 'Lats & Mid Back', 'Glutes', 'Calves', 'Biceps']), restDay('Thursday · Recovery'), day('Friday · Full Body', 'Full body', ['Mid Chest', 'Isolate Upper Back', 'Quads', 'Hamstrings', 'Abs']), restDay('Saturday · Recovery'), restDay('Sunday · Recovery')] },
  { id: 'upper-lower', name: 'Upper / Lower', days: [day('Monday · Upper', 'Chest · Back · Shoulders · Arms', ['Upper Chest', 'Mid Chest', 'Lats & Upper Back', 'Side Delts', 'Biceps', 'Triceps']), day('Tuesday · Lower', 'Quads · Hamstrings · Glutes · Calves · Abs', ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs']), restDay('Wednesday · Recovery'), day('Thursday · Upper', 'Chest · Back · Shoulders · Arms', ['Mid Chest', 'Lats & Mid Back', 'Isolate Upper Back', 'Rear Delts', 'Biceps', 'Triceps']), day('Friday · Lower', 'Quads · Hamstrings · Glutes · Calves · Abs', ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs']), restDay('Saturday · Recovery'), restDay('Sunday · Recovery')] },
  { id: 'ppl', name: 'Push / Pull / Legs', days: [day('Monday · Push', 'Chest · Side delts · Triceps', ['Upper Chest', 'Mid Chest', 'Side Delts', 'Triceps']), day('Tuesday · Pull', 'Back · Rear delts · Biceps', ['Lats & Upper Back', 'Lats & Mid Back', 'Traps', 'Rear Delts', 'Biceps']), day('Wednesday · Legs', 'Quads · Hamstrings · Glutes · Calves', ['Quads', 'Hamstrings', 'Glutes', 'Calves']), restDay('Thursday · Recovery'), day('Friday · Push', 'Chest · Side delts · Triceps', ['Lower Chest', 'Mid Chest', 'Side Delts', 'Triceps']), day('Saturday · Pull', 'Back · Rear delts · Biceps', ['Isolate Upper Back', 'Isolate the Lats', 'Traps', 'Rear Delts', 'Biceps']), restDay('Sunday · Recovery')] },
  { id: 'five-day', name: '5-Day Split', days: [day('Monday · Chest', 'Upper · Mid · Lower chest', ['Upper Chest', 'Mid Chest', 'Lower Chest']), day('Tuesday · Back', 'Lats · Upper back · Traps', ['Lats & Upper Back', 'Lats & Mid Back', 'Isolate Upper Back', 'Traps']), day('Wednesday · Shoulders', 'Side delts · Rear delts · Abs', ['Side Delts', 'Rear Delts', 'Abs']), day('Thursday · Legs', 'Quads · Hamstrings · Glutes · Calves', ['Quads', 'Hamstrings', 'Glutes', 'Calves']), day('Friday · Arms', 'Biceps · Triceps', ['Biceps', 'Triceps']), restDay('Saturday · Recovery'), restDay('Sunday · Recovery')] },
]

export function routineExercise(name: string): RoutineExercise {
  const info = exercises.find((exercise) => exercise.name === name)
  return { name, muscle: info?.muscle ?? 'Custom', group: info?.group ?? 'Custom', sets: 3, reps: '8–12', rest: 90 }
}
