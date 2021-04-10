import test from 'ava';
import 'ses/lockdown';

lockdown();

function isDate(date) {
  return (
    Object.prototype.toString.call(date) === '[object Date]' &&
    Number.isInteger(date.getTime())
  );
}

test('lockdown start Date is powerful', t => {
  t.truthy(Number.isInteger(Date.now()));
  t.truthy(isDate(new Date()));
});

test('lockdown Date.prototype.constructor is powerless', t => {
  const SharedDate = Date.prototype.constructor;
  t.not(Date, SharedDate);
  t.truthy(Number.isNaN(SharedDate.now()));
  t.is(`${new SharedDate()}`, 'Invalid Date');
});

test('lockdown Date in Compartment is powerless', t => {
  const c = new Compartment();
  t.is(c.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));

  const now = c.evaluate('Date.now()');
  t.truthy(Number.isNaN(now));

  const newDate = c.evaluate('new Date()');
  t.is(`${newDate}`, 'Invalid Date');
});

test('lockdown Date in nested Compartment is powerless', t => {
  const c = new Compartment().evaluate('new Compartment()');

  const now = c.evaluate('Date.now()');
  t.truthy(Number.isNaN(now));

  const newDate = c.evaluate('new Date()');
  t.is(`${newDate}`, 'Invalid Date');
});
