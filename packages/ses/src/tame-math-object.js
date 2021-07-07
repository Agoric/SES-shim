import {
  Error,
  Math,
  create,
  getOwnPropertyDescriptors,
  objectPrototype,
} from './commons.js';

export default function tameMathObject(mathTaming = 'safe') {
  if (mathTaming !== 'safe' && mathTaming !== 'unsafe') {
    throw new Error(`unrecognized mathTaming ${mathTaming}`);
  }
  const originalMath = Math;
  const initialMath = originalMath; // to follow the naming pattern

  const { random: _, ...otherDescriptors } = getOwnPropertyDescriptors(
    originalMath,
  );

  const sharedMath = create(objectPrototype, otherDescriptors);

  return {
    '%InitialMath%': initialMath,
    '%SharedMath%': sharedMath,
  };
}
