# XS Metering
Revised: November 10, 2020

Warning: These notes are preliminary. Omissions and errors are likely. If you encounter problems, please ask for assistance.

## Introduction

The objective is to allow runtime to constraint how much computation a machine can do.

The technique is to count how many byte codes are executed and to ask the runtime if the limit has been reached.

Asking the runtime at every byte code would be prohibitively slow. So XS only asks the runtime if the limit has been reached:

- when branching backwards,
- when calling a function,
- when returning from a function,
- when catching an exception,
- when iterating a generator,
- when resuming an async function.

To be faster, the runtime can also set a metering *interval*, a number of byte codes to wait for before asking again.

When the runtime tells XS that the limit has been reached, XS aborts with a "*too much computation*" exit. Like for other exits ("*not enough memory*", "*unhandled exception*", etc), the runtime can then decide what to do:

- throwing an exception,
- exiting the machine,
- exiting the process.

> Both exiting the machine and exiting the process cannot be caught by the executed JavaScript code.

## Programming Interface

To begin metering use the `xsBeginMetering` macro:

	xsBeginMetering(xsMachine* machine,
					xsBooleanValue (*ask)(xsMachine* the, xsUnsignedValue index),
					xsUnsignedValue interval)

- `machine`: the machine to meter.
- `ask`: the C function that XS will call to ask if the limit has been reached.
- `interval`: the metering interval.

The macro uses `setjmp` and must be balanced with the `xsEndMetering` macro:

	xsEndMetering(xsMachine* machine)

- `machine`: the metered machine.

The `ask` callback gets the metered machine and the current index. It returns `1` to tell XS to continue, `0` to tell XS to abort.

## Built-ins

To fine tune the metering, runtimes can patch built-ins functions.

	xsPatchHostFunction(xsSlot function, xsCallback patch)

- `function`: the function to patch.
- `patch`: the callback that replaces the original callback of the function.

Patches must conclude by running their original callback with

	xsMeterHostFunction(xsUnsignedValue count)

- `count`: the number to add to the metering index.

### Example

Here is a patch for `Array.prototype` functions that adds the length of the array to the metering index.

	void fx_Array_prototype_meter(xsMachine* the)
	{
		xsIntegerValue length = xsToInteger(xsGet(xsThis, xsID("length")));
		xsMeterHostFunction(length);
	}

The same patch can be installed into several `Array.prototype` functions, for instance here `Array.prototype.reverse` and `Array.prototype.sort`

	xsBeginHost(machine);
	xsVars(2);
	xsVar(0) = xsGet(xsGlobal, xsID("Array"));
	xsVar(0) = xsGet(xsVar(0), xsID("prototype"));
	xsVar(1) = xsGet(xsVar(0), xsID("reverse"));
	xsPatchHostFunction(xsVar(1), fx_Array_prototype_meter);
	xsVar(1) = xsGet(xsVar(0), xsID("sort"));
	xsPatchHostFunction(xsVar(1), fx_Array_prototype_meter);
	xsEndHost(machine);

## Usage

Here is the typical runtime sequence:

	static xsBooleanValue ask(xsMachine* machine, xsUnsignedValue index)
	{
		if (index > 10000) {
			fprintf(stderr, "too much computation\n");
			return 0;
		}
		return 1;
	}

	int main(int argc, char* argv[])
	{
		//...
		xsMachine* machine xsCreateMachine(creation, "main", NULL);
		xsBeginMetering(machine, ask, 1000);
		{
			xsBeginHost(machine);
			{
				// execute scripts or modules
			}
			xsEndHost(machine);
		}
		xsEndMetering(machine);
		xsDeleteMachine(machine);
		//...
	}

The fxAbort function has to be supplied by all runtimes based on XS. Here the `xsTooMuchComputationExit` case exits the machine.

	void fxAbort(xsMachine* the, int exit)
	{
		if (exit == xsTooMuchComputationExit) {
			fxExitToHost(the);
		}
		//...
	}

### In JavaScript

The runtime must provide a C function for the `ask` callback. However the `ask` callback can use the XS in C programming interface to call a JavaScript function. Like a system callback, the `ask` callback has to use `xsBeginHost` and `xsEndHost`.

	static xsBooleanValue ask(xsMachine* machine, xsUnsignedValue index)
	{
		xsBooleanValue result;
		xsBeginHost(machine);
		{
			result = xsToBoolean(xsCall1(xsGlobal, xsID_ask, xsNumber(index));
		}
		xsEndHost(machine);
		return result;
	}

The metering is suspended during the `ask` callback.

