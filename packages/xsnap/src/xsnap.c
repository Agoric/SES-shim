#include "xsAll.h"
#include "xsScript.h"
#include "xsSnapshot.h"
#include "xs.h"

#define SNAPSHOT_SIGNATURE "xsnap 1"
#ifndef XSNAP_VERSION
# error "You must define XSNAP_VERSION in the right Makefile"
#endif

extern txScript* fxLoadScript(txMachine* the, txString path, txUnsigned flags);

typedef struct sxAliasIDLink txAliasIDLink;
typedef struct sxAliasIDList txAliasIDList;
typedef struct sxJob txJob;
typedef void (*txJobCallback)(txJob*);

struct sxAliasIDLink {
	txAliasIDLink* previous;
	txAliasIDLink* next;
	txInteger id;
	txInteger flag;
};

struct sxAliasIDList {
	txAliasIDLink* first;
	txAliasIDLink* last;
	txFlag* aliases;
	txInteger errorCount;
};

struct sxJob {
	txJob* next;
	txMachine* the;
	txNumber when;
	txJobCallback callback;
	txSlot self;
	txSlot function;
	txSlot argument;
	txNumber interval;
};

static void fxBuildAgent(xsMachine* the);
static txInteger fxCheckAliases(txMachine* the);
static void fxCheckAliasesError(txMachine* the, txAliasIDList* list, txFlag flag);
static void fxCheckEnvironmentAliases(txMachine* the, txSlot* environment, txAliasIDList* list);
static void fxCheckInstanceAliases(txMachine* the, txSlot* instance, txAliasIDList* list);
static void fxFreezeBuiltIns(txMachine* the);
static void fxPatchBuiltIns(txMachine* the);
static void fxPrintUsage();

static void fx_issueCommand(xsMachine *the);
static void fx_Array_prototype_meter(xsMachine* the);

extern void fx_clearTimer(txMachine* the);
static void fx_destroyTimer(void* data);
// static void fx_evalScript(xsMachine* the);
static void fx_gc(xsMachine* the);
// static void fx_isPromiseJobQueueEmpty(xsMachine* the);
static void fx_markTimer(txMachine* the, void* it, txMarkRoot markRoot);
static void fx_print(xsMachine* the);
static void fx_setImmediate(txMachine* the);
// static void fx_setInterval(txMachine* the);
// static void fx_setTimeout(txMachine* the);
static void fx_setTimer(txMachine* the, txNumber interval, txBoolean repeat);
static void fx_setTimerCallback(txJob* job);

static void fxFulfillModuleFile(txMachine* the);
static void fxRejectModuleFile(txMachine* the);
static void fxRunModuleFile(txMachine* the, txString path);
static void fxRunProgramFile(txMachine* the, txString path, txUnsigned flags);
static void fxRunLoop(txMachine* the);

static int fxReadNetString(FILE *inStream, char** dest, size_t* len);
static char* fxReadNetStringError(int code);
static int fxWriteOkay(FILE* outStream, xsUnsignedValue meterIndex, char* buf, size_t len);
static int fxWriteNetString(FILE* outStream, char* prefix, char* buf, size_t len);
static char* fxWriteNetStringError(int code);

// The order of the callbacks materially affects how they are introduced to
// code that runs from a snapshot, so must be consistent in the face of
// upgrade.
#define mxSnapshotCallbackCount 5
txCallback gxSnapshotCallbacks[mxSnapshotCallbackCount] = {
	fx_issueCommand, // 0
	fx_Array_prototype_meter, // 1
	fx_print, // 2
	fx_setImmediate, // 3
	fx_gc, // 4
	// fx_evalScript,
	// fx_isPromiseJobQueueEmpty,
	// fx_setInterval,
	// fx_setTimeout,
	// fx_clearTimer,
};

enum {
	XSL_MODULE_FLAG,
	XSL_EXPORT_FLAG,
	XSL_ENVIRONMENT_FLAG,
	XSL_PROPERTY_FLAG,
	XSL_ITEM_FLAG,
	XSL_GETTER_FLAG,
	XSL_SETTER_FLAG,
	XSL_PROXY_HANDLER_FLAG,
	XSL_PROXY_TARGET_FLAG,
	XSL_GLOBAL_FLAG,
};

#define mxPushLink(name,ID,FLAG) \
	txAliasIDLink name = { C_NULL, C_NULL, ID, FLAG }; \
	name.previous = list->last; \
	if (list->last) \
		list->last->next = &name; \
	else \
		list->first = &name; \
	list->last = &name

#define mxPopLink(name) \
	if (name.previous) \
		name.previous->next = C_NULL; \
	else \
		list->first = C_NULL; \
	list->last = name.previous

static int fxSnapshotRead(void* stream, void* address, size_t size)
{
	return (fread(address, size, 1, stream) == 1) ? 0 : errno;
}

static int fxSnapshotWrite(void* stream, void* address, size_t size)
{
	return (fwrite(address, size, 1, stream) == 1) ? 0 : errno;
}

#if mxMetering
#define xsBeginMetering(_THE, _CALLBACK, _STEP) \
	do { \
		xsJump __HOST_JUMP__; \
		__HOST_JUMP__.nextJump = (_THE)->firstJump; \
		__HOST_JUMP__.stack = (_THE)->stack; \
		__HOST_JUMP__.scope = (_THE)->scope; \
		__HOST_JUMP__.frame = (_THE)->frame; \
		__HOST_JUMP__.environment = NULL; \
		__HOST_JUMP__.code = (_THE)->code; \
		__HOST_JUMP__.flag = 0; \
		(_THE)->firstJump = &__HOST_JUMP__; \
		if (setjmp(__HOST_JUMP__.buffer) == 0) { \
			fxBeginMetering(_THE, _CALLBACK, _STEP)

#define xsEndMetering(_THE) \
			fxEndMetering(_THE); \
		} \
		(_THE)->stack = __HOST_JUMP__.stack, \
		(_THE)->scope = __HOST_JUMP__.scope, \
		(_THE)->frame = __HOST_JUMP__.frame, \
		(_THE)->code = __HOST_JUMP__.code, \
		(_THE)->firstJump = __HOST_JUMP__.nextJump; \
		break; \
	} while(1)

#define xsPatchHostFunction(_FUNCTION,_PATCH) \
	(xsOverflow(-1), \
	fxPush(_FUNCTION), \
	fxPatchHostFunction(the, _PATCH), \
	fxPop())
#define xsMeterHostFunction(_COUNT) \
	fxMeterHostFunction(the, _COUNT)
#define xsBeginCrank(_THE, _LIMIT) \
	((_THE)->meterIndex = 0, \
	gxCurrentMeter = _LIMIT)
#define xsEndCrank(_THE) \
	(gxCurrentMeter = 0, \
	(_THE)->meterIndex)
#else
	#define xsBeginMetering(_THE, _CALLBACK, _STEP)
	#define xsEndMetering(_THE)
	#define xsPatchHostFunction(_FUNCTION,_PATCH)
	#define xsMeterHostFunction(_COUNT) (void)(_COUNT)
	#define xsBeginCrank(_THE, _LIMIT)
	#define xsEndCrank(_THE) 0
#endif

static xsUnsignedValue gxCrankMeteringLimit = 0;
static xsUnsignedValue gxCurrentMeter = 0;
xsBooleanValue fxMeteringCallback(xsMachine* the, xsUnsignedValue index)
{
	if (gxCurrentMeter > 0 && index > gxCurrentMeter) {
		// Just throw right out of the main loop and exit.
		return 0;
	}
	// fprintf(stderr, "metering up to %d\n", index);
	return 1;
}
static xsBooleanValue gxMeteringPrint = 0;

static FILE *fromParent;
static FILE *toParent;

int main(int argc, char* argv[])
{
	int argi;
	int argr = 0;
	int error = 0;
	int interval = 0;
	int freeze = 0;
	int parserBufferSize = 8192 * 1024;

	txSnapshot snapshot = {
		SNAPSHOT_SIGNATURE,
		sizeof(SNAPSHOT_SIGNATURE) - 1,
		gxSnapshotCallbacks,
		mxSnapshotCallbackCount,
		fxSnapshotRead,
		fxSnapshotWrite,
		NULL,
		0,
		NULL,
		NULL,
		NULL,
	};

	xsMachine* machine;
	char *path;
	char* dot;

	for (argi = 1; argi < argc; argi++) {
		if (argv[argi][0] != '-')
			continue;
		if (!strcmp(argv[argi], "-f")) {
			freeze = 1;
		}
		else if (!strcmp(argv[argi], "-h")) {
			fxPrintUsage();
			return 0;
		} else if (!strcmp(argv[argi], "-i")) {
			argi++;
			if (argi < argc)
				interval = atoi(argv[argi]);
			else {
				fxPrintUsage();
				return 1;
			}
		}
		else if (!strcmp(argv[argi], "-l")) {
#if mxMetering
			argi++;
			if (argi < argc)
				gxCrankMeteringLimit = atoi(argv[argi]);
			else {
				fxPrintUsage();
				return 1;
			}
#else
			fprintf(stderr, "%s flag not implemented; mxMetering is not enabled\n", argv[argi]);
			return 1;
#endif
		}
		else if (!strcmp(argv[argi], "-p"))
			gxMeteringPrint = 1;
		else if (!strcmp(argv[argi], "-r")) {
			argi++;
			if (argi < argc)
				argr = argi;
			else {
				fxPrintUsage();
				return 1;
			}
		}
		else if (!strcmp(argv[argi], "-s")) {
			argi++;
			if (argi < argc)
				parserBufferSize = 1024 * atoi(argv[argi]);
			else {
				fxPrintUsage();
				return 1;
			}
		}
		else if (!strcmp(argv[argi], "-v")) {
			printf("xsnap %s (XS %d.%d.%d)\n", XSNAP_VERSION, XS_MAJOR_VERSION, XS_MINOR_VERSION, XS_PATCH_VERSION);
			return 0;
		} else {
			fxPrintUsage();
			return 1;
		}
	}
	xsCreation _creation = {
		16 * 1024 * 1024,	/* initialChunkSize */
		16 * 1024 * 1024,	/* incrementalChunkSize */
		1 * 1024 * 1024,	/* initialHeapCount */
		1 * 1024 * 1024,	/* incrementalHeapCount */
		4096,				/* stackCount */
		32000,				/* keyCount */
		1993,				/* nameModulo */
		127,				/* symbolModulo */
		parserBufferSize,	/* parserBufferSize */
		1993,				/* parserTableModulo */
	};
	xsCreation* creation = &_creation;

	if (gxCrankMeteringLimit) {
		if (interval == 0)
			interval = 1;
	}
	fxInitializeSharedCluster();
	if (argr) {
		snapshot.stream = fopen(argv[argr], "rb");
		if (snapshot.stream) {
			machine = fxReadSnapshot(&snapshot, "xsnap", NULL);
			fclose(snapshot.stream);
		}
		else
			snapshot.error = errno;
		if (snapshot.error) {
			fprintf(stderr, "cannot read snapshot %s: %s\n", argv[argr], strerror(snapshot.error));
			return 1;
		}
	}
	else {
		machine = xsCreateMachine(creation, "xsnap", NULL);
		fxBuildAgent(machine);
		fxPatchBuiltIns(machine);
	}
	if (freeze) {
		fxFreezeBuiltIns(machine);
		fxShareMachine(machine);
		fxCheckAliases(machine);
		machine = xsCloneMachine(creation, machine, "xsnap", NULL);
	}
	if (!(fromParent = fdopen(3, "rb"))) {
		fprintf(stderr, "fdopen(3) from parent failed\n");
		c_exit(1);
	}
	if (!(toParent = fdopen(4, "wb"))) {
		fprintf(stderr, "fdopen(4) to parent failed\n");
		c_exit(1);
	}
	xsBeginMetering(machine, fxMeteringCallback, interval);
	{
		char done = 0;
		while (!done) {
			// By default, use the infinite meter.
			gxCurrentMeter = 0;

			xsUnsignedValue meterIndex = 0;
			char* nsbuf;
			size_t nslen;
			int readError = fxReadNetString(fromParent, &nsbuf, &nslen);
			int writeError = 0;

			if (readError != 0) {
				if (feof(fromParent)) {
					break;
				} else {
					fprintf(stderr, "%s\n", fxReadNetStringError(readError));
					c_exit(1);
				}
			}
			char command = *nsbuf;
			// fprintf(stderr, "command: len %d %c arg: %s\n", nslen, command, nsbuf + 1);
			switch(command) {
			case '?':
			case 'e':
				xsBeginCrank(machine, gxCrankMeteringLimit);
				error = 0;
				xsBeginHost(machine);
				{
					xsVars(3);
					xsTry {
						if (command == '?') {
							xsVar(0) = xsArrayBuffer(nsbuf + 1, nslen - 1);
							xsVar(1) = xsCall1(xsGlobal, xsID("handleCommand"), xsVar(0));
						} else {
							xsVar(0) = xsStringBuffer(nsbuf + 1, nslen - 1);
							xsVar(1) = xsCall1(xsGlobal, xsID("eval"), xsVar(0));
						}
					}
					xsCatch {
						if (xsTypeOf(xsException) != xsUndefinedType) {
							// fprintf(stderr, "%c: %s\n", command, xsToString(xsException));
							error = 1;
							xsVar(1) = xsException;
							xsException = xsUndefined;
						}
					}
				}
				fxRunLoop(machine);
				meterIndex = xsEndCrank(machine);
				{
					if (error) {
						xsStringValue message = xsToString(xsVar(1));
						writeError = fxWriteNetString(toParent, "!", message, strlen(message));
						// fprintf(stderr, "error: %d, writeError: %d %s\n", error, writeError, message);
					} else {
						char* response = NULL;
						txInteger responseLength = 0;
						// fprintf(stderr, "report: %d %s\n", xsTypeOf(report), xsToString(report));
						xsTry {
							if (xsTypeOf(xsVar(1)) == xsReferenceType && xsHas(xsVar(1), xsID("result"))) {
								xsVar(2) = xsGet(xsVar(1), xsID("result"));
							} else {
								xsVar(2) = xsVar(1);
							}
							// fprintf(stderr, "result: %d %s\n", xsTypeOf(result), xsToString(result));
							if (xsIsInstanceOf(xsVar(2), xsArrayBufferPrototype)) {
								responseLength = xsGetArrayBufferLength(xsVar(2));
								response = xsToArrayBuffer(xsVar(2));
							}
						}
						xsCatch {
							if (xsTypeOf(xsException) != xsUndefinedType) {
								fprintf(stderr, "%c computing response %d %d: %s: %s\n", command,
												xsTypeOf(xsVar(1)), xsTypeOf(xsVar(2)),
												xsToString(xsVar(2)),
												xsToString(xsException));
								xsException = xsUndefined;
							}
						}
						// fprintf(stderr, "response of %d bytes\n", responseLength);
						writeError = fxWriteOkay(toParent, meterIndex, response, responseLength);
					}
				}
				xsEndHost(machine);
				if (writeError != 0) {
					fprintf(stderr, "%s\n", fxWriteNetStringError(writeError));
					c_exit(1);
				}
				break;
			case 's':
			case 'm':
				xsBeginCrank(machine, gxCrankMeteringLimit);
				path = nsbuf + 1;
				xsBeginHost(machine);
				{
					xsVars(1);
					xsTry {
						// ISSUE: realpath necessary? realpath(x, x) doesn't seem to work.
						dot = strrchr(path, '.');
						if (command == 'm')
							fxRunModuleFile(the, path);
						else
							fxRunProgramFile(the, path, mxProgramFlag | mxDebugFlag);
					}
					xsCatch {
						if (xsTypeOf(xsException) != xsUndefinedType) {
							fprintf(stderr, "%s\n", xsToString(xsException));
							error = 1;
							xsException = xsUndefined;
						}
					}
				}
				xsEndHost(machine);
				fxRunLoop(machine);
				meterIndex = xsEndCrank(machine);
				if (error == 0) {
					int writeError = fxWriteOkay(toParent, meterIndex, "", 0);
					if (writeError != 0) {
						fprintf(stderr, "%s\n", fxWriteNetStringError(writeError));
						c_exit(1);
					}
				} else {
					// TODO: dynamically build error message including Exception message.
					int writeError = fxWriteNetString(toParent, "!", "", 0);
					if (writeError != 0) {
						fprintf(stderr, "%s\n", fxWriteNetStringError(writeError));
						c_exit(1);
					}
				}
				break;

			case 'w':
				path = nsbuf + 1;
				snapshot.stream = fopen(path, "wb");
				if (snapshot.stream) {
					fxWriteSnapshot(machine, &snapshot);
					fclose(snapshot.stream);
				}
				else
					snapshot.error = errno;
				if (snapshot.error) {
					fprintf(stderr, "cannot write snapshot %s: %s\n",
							path, strerror(snapshot.error));
				}
				if (snapshot.error == 0) {
					int writeError = fxWriteOkay(toParent, meterIndex, "", 0);
					if (writeError != 0) {
						fprintf(stderr, "%s\n", fxWriteNetStringError(writeError));
						c_exit(1);
					}
				} else {
					// TODO: dynamically build error message including Exception message.
					int writeError = fxWriteNetString(toParent, "!", "", 0);
					if (writeError != 0) {
						fprintf(stderr, "%s\n", fxWriteNetStringError(writeError));
						c_exit(1);
					}
				}
				break;
			case -1:
			default:
				done = 1;
				break;
			}
			free(nsbuf);
		}
		xsBeginHost(machine);
		{
			if (xsTypeOf(xsException) != xsUndefinedType) {
				fprintf(stderr, "%s\n", xsToString(xsException));
				error = 1;
			}
		}
		xsEndHost(machine);
	}
	xsEndMetering(machine);
	xsDeleteMachine(machine);
	fxTerminateSharedCluster();
	return error;
}

void fxBuildAgent(xsMachine* the)
{
	txSlot* slot;
	mxPush(mxGlobal);
	slot = fxLastProperty(the, fxToInstance(the, the->stack));
	slot = fxNextHostFunctionProperty(the, slot, fx_issueCommand, 1, xsID("issueCommand"), XS_DONT_ENUM_FLAG);
	// slot = fxNextHostFunctionProperty(the, slot, fx_clearTimer, 1, xsID("clearImmediate"), XS_DONT_ENUM_FLAG);
	// slot = fxNextHostFunctionProperty(the, slot, fx_clearTimer, 1, xsID("clearInterval"), XS_DONT_ENUM_FLAG);
	// slot = fxNextHostFunctionProperty(the, slot, fx_clearTimer, 1, xsID("clearTimeout"), XS_DONT_ENUM_FLAG);
	// slot = fxNextHostFunctionProperty(the, slot, fx_evalScript, 1, xsID("evalScript"), XS_DONT_ENUM_FLAG);
	slot = fxNextHostFunctionProperty(the, slot, fx_gc, 1, xsID("gc"), XS_DONT_ENUM_FLAG);
	// slot = fxNextHostFunctionProperty(the, slot, fx_isPromiseJobQueueEmpty, 1, xsID("isPromiseJobQueueEmpty"), XS_DONT_ENUM_FLAG);
	slot = fxNextHostFunctionProperty(the, slot, fx_print, 1, xsID("print"), XS_DONT_ENUM_FLAG);
	slot = fxNextHostFunctionProperty(the, slot, fx_setImmediate, 1, xsID("setImmediate"), XS_DONT_ENUM_FLAG);
	// slot = fxNextHostFunctionProperty(the, slot, fx_setInterval, 1, xsID("setInterval"), XS_DONT_ENUM_FLAG);
	// slot = fxNextHostFunctionProperty(the, slot, fx_setTimeout, 1, xsID("setTimeout"), XS_DONT_ENUM_FLAG);

	// mxPush(mxObjectPrototype);
	// fxNextHostFunctionProperty(the, fxLastProperty(the, fxNewObjectInstance(the)), fx_print, 1, xsID("log"), XS_DONT_ENUM_FLAG);
	// slot = fxNextSlotProperty(the, slot, the->stack, xsID("console"), XS_DONT_ENUM_FLAG);
	// mxPop();

	mxPop();
}

txInteger fxCheckAliases(txMachine* the)
{
	txAliasIDList _list = { C_NULL, C_NULL }, *list = &_list;
	txSlot* module = mxProgram.value.reference->next; //@@
	list->aliases = c_calloc(the->aliasCount, sizeof(txFlag));
	while (module) {
		txSlot* export = mxModuleExports(module)->value.reference->next;
		if (export) {
			mxPushLink(moduleLink, module->ID, XSL_MODULE_FLAG);
			while (export) {
				txSlot* closure = export->value.export.closure;
				if (closure) {
					mxPushLink(exportLink, export->ID, XSL_EXPORT_FLAG);
					if (closure->ID != XS_NO_ID) {
						if (list->aliases[closure->ID] == 0) {
							list->aliases[closure->ID] = 1;
							fxCheckAliasesError(the, list, 0);
						}
					}
					if (closure->kind == XS_REFERENCE_KIND) {
						fxCheckInstanceAliases(the, closure->value.reference, list);
					}
					mxPopLink(exportLink);
				}
				export = export->next;
			}
			mxPopLink(moduleLink);
		}
		module = module->next;
	}
	{
		txSlot* global = mxGlobal.value.reference->next->next;
		while (global) {
			if ((global->ID != mxID(_global)) && (global->ID != mxID(_globalThis))) {
				mxPushLink(globalLink, global->ID, XSL_GLOBAL_FLAG);
				if (global->kind == XS_REFERENCE_KIND) {
					fxCheckInstanceAliases(the, global->value.reference, list);
				}
				mxPopLink(globalLink);
			}
			global = global->next;
		}
	}
	{
		fxCheckEnvironmentAliases(the, mxException.value.reference, list);
	}
	return list->errorCount;
}

void fxCheckAliasesError(txMachine* the, txAliasIDList* list, txFlag flag)
{
	txAliasIDLink* link = list->first;
	if (flag > 1)
		fprintf(stderr, "### error");
	else
		fprintf(stderr, "### warning");
	while (link) {
		switch (link->flag) {
		case XSL_PROPERTY_FLAG: fprintf(stderr, "."); break;
		case XSL_ITEM_FLAG: fprintf(stderr, "["); break;
		case XSL_GETTER_FLAG: fprintf(stderr, ".get "); break;
		case XSL_SETTER_FLAG: fprintf(stderr, ".set "); break;
		case XSL_ENVIRONMENT_FLAG: fprintf(stderr, "() "); break;
		case XSL_PROXY_HANDLER_FLAG: fprintf(stderr, ".(handler)"); break;
		case XSL_PROXY_TARGET_FLAG: fprintf(stderr, ".(target)"); break;
		default: fprintf(stderr, ": "); break;
		}
		if (link->id < 0) {
			if (link->id != XS_NO_ID) {
				char* string = fxGetKeyName(the, link->id);
				if (string) {
					if (link->flag == XSL_MODULE_FLAG) {
						char* dot = c_strrchr(string, '.');
						if (dot) {
							*dot = 0;
							fprintf(stderr, "\"%s\"", string);
							*dot = '.';
						}
						else
							fprintf(stderr, "%s", string);
					}
					else if (link->flag == XSL_GLOBAL_FLAG) {
						fprintf(stderr, "globalThis.");
						fprintf(stderr, "%s", string);
					}
					else
						fprintf(stderr, "%s", string);
				}
				else
					fprintf(stderr, "%d", link->id);
			}
		}
		else
			fprintf(stderr, "%d", link->id);
		if (link->flag == XSL_ITEM_FLAG)
			fprintf(stderr, "]");
		link = link->next;
	}
	if (flag == 3) {
		fprintf(stderr, ": generator\n");
		list->errorCount++;
	}
	else if (flag == 2) {
		fprintf(stderr, ": regexp\n");
		list->errorCount++;
	}
	else if (flag)
		fprintf(stderr, ": not frozen\n");
	else
		fprintf(stderr, ": no const\n");
}

void fxCheckEnvironmentAliases(txMachine* the, txSlot* environment, txAliasIDList* list)
{
	txSlot* closure = environment->next;
	if (environment->flag & XS_LEVEL_FLAG)
		return;
	environment->flag |= XS_LEVEL_FLAG;
	if (environment->value.instance.prototype)
		fxCheckEnvironmentAliases(the, environment->value.instance.prototype, list);
	while (closure) {
		if (closure->kind == XS_CLOSURE_KIND) {
			txSlot* slot = closure->value.closure;
			mxPushLink(closureLink, closure->ID, XSL_ENVIRONMENT_FLAG);
			if (slot->ID != XS_NO_ID) {
				if (list->aliases[slot->ID] == 0) {
					list->aliases[slot->ID] = 1;
					fxCheckAliasesError(the, list, 0);
				}
			}
			if (slot->kind == XS_REFERENCE_KIND) {
				fxCheckInstanceAliases(the, slot->value.reference, list);
			}
			mxPopLink(closureLink);
		}
		closure = closure->next;
	}
	//environment->flag &= ~XS_LEVEL_FLAG;
}

void fxCheckInstanceAliases(txMachine* the, txSlot* instance, txAliasIDList* list)
{
	txSlot* property = instance->next;
	if (instance->flag & XS_LEVEL_FLAG)
		return;
	instance->flag |= XS_LEVEL_FLAG;
	if (instance->value.instance.prototype) {
		mxPushLink(propertyLink, mxID(___proto__), XSL_PROPERTY_FLAG);
		fxCheckInstanceAliases(the, instance->value.instance.prototype, list);
		mxPopLink(propertyLink);
	}
	if (instance->ID != XS_NO_ID) {
		if (list->aliases[instance->ID] == 0) {
			list->aliases[instance->ID] = 1;
			fxCheckAliasesError(the, list, 1);
		}
	}
	while (property) {
		if (property->kind == XS_ACCESSOR_KIND) {
			if (property->value.accessor.getter) {
				mxPushLink(propertyLink, property->ID, XSL_GETTER_FLAG);
				fxCheckInstanceAliases(the, property->value.accessor.getter, list);
				mxPopLink(propertyLink);
			}
			if (property->value.accessor.setter) {
				mxPushLink(propertyLink, property->ID, XSL_SETTER_FLAG);
				fxCheckInstanceAliases(the, property->value.accessor.setter, list);
				mxPopLink(propertyLink);
			}
		}
		else if (property->kind == XS_ARRAY_KIND) {
			txSlot* item = property->value.array.address;
			txInteger length = (txInteger)fxGetIndexSize(the, property);
			while (length > 0) {
				if (item->kind == XS_REFERENCE_KIND) {
					mxPushLink(propertyLink,  (txInteger)(item->next), XSL_ITEM_FLAG);
					fxCheckInstanceAliases(the, item->value.reference, list);
					mxPopLink(propertyLink);
				}
				item++;
				length--;
			}
		}
		else if ((property->kind == XS_CODE_KIND) || (property->kind == XS_CODE_X_KIND)) {
			if (property->value.code.closures)
				fxCheckEnvironmentAliases(the, property->value.code.closures, list);
		}
		else if (property->kind == XS_PROXY_KIND) {
			if (property->value.proxy.handler) {
				mxPushLink(propertyLink, XS_NO_ID, XSL_PROXY_HANDLER_FLAG);
				fxCheckInstanceAliases(the, property->value.proxy.handler, list);
				mxPopLink(propertyLink);
			}
			if (property->value.proxy.target) {
				mxPushLink(propertyLink, XS_NO_ID, XSL_PROXY_TARGET_FLAG);
				fxCheckInstanceAliases(the, property->value.proxy.target, list);
				mxPopLink(propertyLink);
			}
		}
		else if (property->kind == XS_REFERENCE_KIND) {
			mxPushLink(propertyLink, property->ID, XSL_PROPERTY_FLAG);
			fxCheckInstanceAliases(the, property->value.reference, list);
			mxPopLink(propertyLink);
		}
		property = property->next;
	}
//	instance->flag &= ~XS_LEVEL_FLAG;
}

void fxFreezeBuiltIns(txMachine* the)
{
#define mxFreezeBuiltInCall \
	mxPush(mxObjectConstructor); \
	mxPushSlot(freeze); \
	mxCall()
#define mxFreezeBuiltInRun \
	mxPushBoolean(1); \
	mxRunCount(2); \
	mxPop()

	txSlot* freeze;
	txInteger id;

	mxTemporary(freeze);
	mxPush(mxObjectConstructor);
	fxGetID(the, mxID(_freeze));
	mxPullSlot(freeze);

	for (id = XS_SYMBOL_ID_COUNT; id < _Infinity; id++) {
		mxFreezeBuiltInCall; mxPush(the->stackPrototypes[-1 - id]); mxFreezeBuiltInRun;
	}
	for (id = _Compartment; id < XS_INTRINSICS_COUNT; id++) {
		mxFreezeBuiltInCall; mxPush(the->stackPrototypes[-1 - id]); mxFreezeBuiltInRun;
	}
	mxFreezeBuiltInCall; mxPush(mxGlobal); fxGetID(the, xsID("gc")); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGlobal); fxGetID(the, xsID("evalScript")); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGlobal); fxGetID(the, xsID("print")); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGlobal); fxGetID(the, xsID("clearInterval")); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGlobal); fxGetID(the, xsID("clearTimeout")); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGlobal); fxGetID(the, xsID("setInterval")); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGlobal); fxGetID(the, xsID("setTimeout")); mxFreezeBuiltInRun;

	mxFreezeBuiltInCall; mxPush(mxArgumentsSloppyPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxArgumentsStrictPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxArrayIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxAsyncFromSyncIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxAsyncFunctionPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxAsyncGeneratorFunctionPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxAsyncGeneratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxAsyncIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGeneratorFunctionPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxGeneratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxHostPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxMapEntriesIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxMapKeysIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxMapValuesIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxModulePrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxRegExpStringIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxSetEntriesIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxSetKeysIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxSetValuesIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxStringIteratorPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxTransferPrototype); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxTypedArrayPrototype); mxFreezeBuiltInRun;

	mxFreezeBuiltInCall; mxPush(mxAssignObjectFunction); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxCopyObjectFunction); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxEnumeratorFunction); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxInitializeRegExpFunction); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxOnRejectedPromiseFunction); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxOnResolvedPromiseFunction); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPush(mxOnThenableFunction); mxFreezeBuiltInRun;

	mxFreezeBuiltInCall; mxPushReference(mxArrayLengthAccessor.value.accessor.getter); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPushReference(mxArrayLengthAccessor.value.accessor.setter); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPushReference(mxStringAccessor.value.accessor.getter); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPushReference(mxStringAccessor.value.accessor.setter); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPushReference(mxProxyAccessor.value.accessor.getter); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPushReference(mxProxyAccessor.value.accessor.setter); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPushReference(mxTypedArrayAccessor.value.accessor.getter); mxFreezeBuiltInRun;
	mxFreezeBuiltInCall; mxPushReference(mxTypedArrayAccessor.value.accessor.setter); mxFreezeBuiltInRun;

	mxFreezeBuiltInCall; mxPush(mxArrayPrototype); fxGetID(the, mxID(_Symbol_unscopables)); mxFreezeBuiltInRun;

	mxFreezeBuiltInCall; mxPush(mxProgram); mxFreezeBuiltInRun; //@@
	mxFreezeBuiltInCall; mxPush(mxHosts); mxFreezeBuiltInRun; //@@

	mxPop();
}

void fx_Array_prototype_meter(xsMachine* the)
{
	xsIntegerValue length = xsToInteger(xsGet(xsThis, xsID("length")));
	xsMeterHostFunction(length);
}

void fxPatchBuiltIns(txMachine* machine)
{
	// FIXME: This function is disabled because it caused failures.
	// https://github.com/Moddable-OpenSource/moddable/issues/550

	// TODO: Provide complete metering of builtins and operators.
#if 0
	xsBeginHost(machine);
	xsVars(2);
	xsVar(0) = xsGet(xsGlobal, xsID("Array"));
	xsVar(0) = xsGet(xsVar(0), xsID("prototype"));
	xsVar(1) = xsGet(xsVar(0), xsID("reverse"));
	xsPatchHostFunction(xsVar(1), fx_Array_prototype_meter);
	xsVar(1) = xsGet(xsVar(0), xsID("sort"));
	xsPatchHostFunction(xsVar(1), fx_Array_prototype_meter);
	xsEndHost(machine);
#endif
}

void fxPrintUsage()
{
	printf("xsnap [-h] [-f] [-i <interval>] [-l <limit>] [-s <size>] [-m] [-r <snapshot>] [-s] [-v]\n");
	printf("\t-f: freeze the XS machine\n");
	printf("\t-h: print this help message\n");
	printf("\t-i <interval>: metering interval (default to 1)\n");
	printf("\t-l <limit>: metering limit (default to none)\n");
	printf("\t-s <size>: parser buffer size, in kB (default to 8192)\n");
	printf("\t-r <snapshot>: read snapshot to create the XS machine\n");
	printf("\t-v: print XS version\n");
}

// void fx_evalScript(xsMachine* the)
// {
// 	txSlot* realm = mxProgram.value.reference->next->value.module.realm;
// 	txStringStream aStream;
// 	aStream.slot = mxArgv(0);
// 	aStream.offset = 0;
// 	aStream.size = c_strlen(fxToString(the, mxArgv(0)));
// 	fxRunScript(the, fxParseScript(the, &aStream, fxStringGetter, mxProgramFlag | mxDebugFlag), mxRealmGlobal(realm), C_NULL, mxRealmClosures(realm)->value.reference, C_NULL, mxProgram.value.reference);
// 	mxPullSlot(mxResult);
// }

void fx_gc(xsMachine* the)
{
	xsCollectGarbage();
}

// void fx_isPromiseJobQueueEmpty(txMachine* the)
// {
// 	xsResult = (the->promiseJobs) ? xsFalse : xsTrue;
// }

void fx_print(xsMachine* the)
{
	xsIntegerValue c = xsToInteger(xsArgc), i;
#if mxMetering
	if (gxMeteringPrint)
		fprintf(stdout, "[%u] ", the->meterIndex);
#endif
	for (i = 0; i < c; i++) {
		if (i)
			fprintf(stdout, " ");
		fprintf(stdout, "%s", xsToString(xsArg(i)));
	}
	fprintf(stdout, "\n");
		fflush(stdout);
}

// void fx_setInterval(txMachine* the)
// {
// 	fx_setTimer(the, fxToNumber(the, mxArgv(1)), 1);
// }
// 
// void fx_setTimeout(txMachine* the)
// {
// 	fx_setTimer(the, fxToNumber(the, mxArgv(1)), 0);
// }
void fx_setImmediate(txMachine* the)
{
	fx_setTimer(the, 0, 0);
}


void fx_clearTimer(txMachine* the)
{
	txJob* job = xsGetHostData(xsArg(0));
	if (job) {
		xsForget(job->self);
		xsSetHostData(xsArg(0), NULL);
		job->the = NULL;
	}
}

static txHostHooks gxTimerHooks = {
	fx_destroyTimer,
	fx_markTimer
};


void fx_destroyTimer(void* data)
{
}

void fx_markTimer(txMachine* the, void* it, txMarkRoot markRoot)
{
	txJob* job = it;
	if (job) {
		(*markRoot)(the, &job->function);
		(*markRoot)(the, &job->argument);
	}
}

void fx_setTimer(txMachine* the, txNumber interval, txBoolean repeat)
{
	c_timeval tv;
	txJob* job;
	txJob** address = (txJob**)&(the->timerJobs);
	while ((job = *address))
		address = &(job->next);
	job = *address = malloc(sizeof(txJob));
	c_memset(job, 0, sizeof(txJob));
	job->the = the;
	job->callback = fx_setTimerCallback;
	c_gettimeofday(&tv, NULL);
	if (repeat)
		job->interval = interval;
	job->when = ((txNumber)(tv.tv_sec) * 1000.0) + ((txNumber)(tv.tv_usec) / 1000.0) + interval;
	job->self = xsNewHostObject(NULL);
	job->function = xsArg(0);
	if (xsToInteger(xsArgc) > 2)
		job->argument = xsArg(2);
	else
		job->argument = xsUndefined;
	xsSetHostData(job->self, job);
	xsSetHostHooks(job->self,  &gxTimerHooks);
	xsRemember(job->self);
	xsResult = xsAccess(job->self);
}

void fx_setTimerCallback(txJob* job)
{
	xsMachine* the = job->the;
	xsBeginHost(the);
	{
		mxTry(the) {
			xsCallFunction1(job->function, xsUndefined, job->argument);
		}
		mxCatch(the) {
			fprintf(stderr, "exception in setTimerCallback: %s\n", xsToString(xsException));
		}
	}
	xsEndHost(the);
}

/* PLATFORM */

void fxAbort(txMachine* the, int status)
{
	switch (status) {
		case XS_STACK_OVERFLOW_EXIT:
			xsLog("stack overflow\n");
#ifdef mxDebug
			fxDebugger(the, (char *)__FILE__, __LINE__);
#endif
		c_exit(status);
			break;
	case XS_NOT_ENOUGH_MEMORY_EXIT:
		xsLog("memory full\n");
#ifdef mxDebug
		fxDebugger(the, (char *)__FILE__, __LINE__);
#endif
		c_exit(status);
		break;
	case XS_NO_MORE_KEYS_EXIT:
		xsLog("not enough keys\n");
#ifdef mxDebug
		fxDebugger(the, (char *)__FILE__, __LINE__);
#endif
		c_exit(status);
		break;
	case XS_TOO_MUCH_COMPUTATION_EXIT:
		xsLog("too much computation\n");
#ifdef mxDebug
		fxDebugger(the, (char *)__FILE__, __LINE__);
#endif
		c_exit(status);
		break;
	case XS_UNHANDLED_EXCEPTION_EXIT:
	case XS_UNHANDLED_REJECTION_EXIT:
		xsLog("%s\n", xsToString(xsException));
		xsException = xsUndefined;
		break;
	default:
		c_exit(status);
		break;
	}
}

void fxCreateMachinePlatform(txMachine* the)
{
#ifdef mxDebug
	the->connection = mxNoSocket;
#endif
	the->promiseJobs = 0;
	the->timerJobs = NULL;
}

void fxDeleteMachinePlatform(txMachine* the)
{
}

void fxQueuePromiseJobs(txMachine* the)
{
	the->promiseJobs = 1;
}

void fxRunLoop(txMachine* the)
{
	c_timeval tv;
	txNumber when;
	txJob* job;
	txJob** address;
	for (;;) {
		while (the->promiseJobs) {
			the->promiseJobs = 0;
			fxRunPromiseJobs(the);
		}
		c_gettimeofday(&tv, NULL);
		when = ((txNumber)(tv.tv_sec) * 1000.0) + ((txNumber)(tv.tv_usec) / 1000.0);
		address = (txJob**)&(the->timerJobs);
		if (!*address)
			break;
		while ((job = *address)) {
			if (job->the) {
				if (job->when <= when) {
					(*job->callback)(job);
					if (job->the) {
						if (job->interval) {
							job->when += job->interval;
						}
						else {
							xsBeginHost(job->the);
							xsResult = xsAccess(job->self);
							xsForget(job->self);
							xsSetHostData(xsResult, NULL);
							xsEndHost(job->the);
							job->the = NULL;
						}
					}
					break; // to run promise jobs queued by the timer in the same "tick"
				}
				address = &(job->next);
			}
			else {
				*address = job->next;
				c_free(job);
			}
		}
	}
}

void fxFulfillModuleFile(txMachine* the)
{
	xsException = xsUndefined;
}

void fxRejectModuleFile(txMachine* the)
{
	xsException = xsArg(0);
}

void fxRunModuleFile(txMachine* the, txString path)
{
	txSlot* realm = mxProgram.value.reference->next->value.module.realm;
	mxPushStringC(path);
	fxRunImport(the, realm, XS_NO_ID);
	mxDub();
	fxGetID(the, mxID(_then));
	mxCall();
	fxNewHostFunction(the, fxFulfillModuleFile, 1, XS_NO_ID);
	fxNewHostFunction(the, fxRejectModuleFile, 1, XS_NO_ID);
	mxRunCount(2);
	mxPop();
}

void fxRunProgramFile(txMachine* the, txString path, txUnsigned flags)
{
	txSlot* realm = mxProgram.value.reference->next->value.module.realm;
	txScript* script = fxLoadScript(the, path, flags);
	if (!script) {
		xsUnknownError("cannot load script; check filename");
	}
	mxModuleInstanceInternal(mxProgram.value.reference)->value.module.id = fxID(the, path);
	fxRunScript(the, script, mxRealmGlobal(realm), C_NULL, mxRealmClosures(realm)->value.reference, C_NULL, mxProgram.value.reference);
	mxPullSlot(mxResult);
}

/* DEBUG */

#ifdef mxDebug

void fxConnect(txMachine* the)
{
	char name[256];
	char* colon;
	int port;
	struct sockaddr_in address;
#if mxWindows
	if (GetEnvironmentVariable("XSBUG_HOST", name, sizeof(name))) {
#else
	colon = getenv("XSBUG_HOST");
	if ((colon) && (c_strlen(colon) + 1 < sizeof(name))) {
		c_strcpy(name, colon);
#endif
		colon = strchr(name, ':');
		if (colon == NULL)
			port = 5002;
		else {
			*colon = 0;
			colon++;
			port = strtol(colon, NULL, 10);
		}
	}
	else {
		strcpy(name, "localhost");
		port = 5002;
	}
	memset(&address, 0, sizeof(address));
	address.sin_family = AF_INET;
	address.sin_addr.s_addr = inet_addr(name);
	if (address.sin_addr.s_addr == INADDR_NONE) {
		struct hostent *host = gethostbyname(name);
		if (!host)
			return;
		memcpy(&(address.sin_addr), host->h_addr, host->h_length);
	}
	address.sin_port = htons(port);
#if mxWindows
{
	WSADATA wsaData;
	unsigned long flag;
	if (WSAStartup(0x202, &wsaData) == SOCKET_ERROR)
		return;
	the->connection = socket(AF_INET, SOCK_STREAM, 0);
	if (the->connection == INVALID_SOCKET)
		return;
	flag = 1;
	ioctlsocket(the->connection, FIONBIO, &flag);
	if (connect(the->connection, (struct sockaddr*)&address, sizeof(address)) == SOCKET_ERROR) {
		if (WSAEWOULDBLOCK == WSAGetLastError()) {
			fd_set fds;
			struct timeval timeout = { 2, 0 }; // 2 seconds, 0 micro-seconds
			FD_ZERO(&fds);
			FD_SET(the->connection, &fds);
			if (select(0, NULL, &fds, NULL, &timeout) == 0)
				goto bail;
			if (!FD_ISSET(the->connection, &fds))
				goto bail;
		}
		else
			goto bail;
	}
	flag = 0;
	ioctlsocket(the->connection, FIONBIO, &flag);
}
#else
{
	int flag;
	the->connection = socket(AF_INET, SOCK_STREAM, 0);
	if (the->connection <= 0)
		goto bail;
	c_signal(SIGPIPE, SIG_IGN);
#if mxMacOSX
	{
		int set = 1;
		setsockopt(the->connection, SOL_SOCKET, SO_NOSIGPIPE, (void *)&set, sizeof(int));
	}
#endif
	flag = fcntl(the->connection, F_GETFL, 0);
	fcntl(the->connection, F_SETFL, flag | O_NONBLOCK);
	if (connect(the->connection, (struct sockaddr*)&address, sizeof(address)) < 0) {
		 if (errno == EINPROGRESS) {
			fd_set fds;
			struct timeval timeout = { 2, 0 }; // 2 seconds, 0 micro-seconds
			int error = 0;
			unsigned int length = sizeof(error);
			FD_ZERO(&fds);
			FD_SET(the->connection, &fds);
			if (select(the->connection + 1, NULL, &fds, NULL, &timeout) == 0)
				goto bail;
			if (!FD_ISSET(the->connection, &fds))
				goto bail;
			if (getsockopt(the->connection, SOL_SOCKET, SO_ERROR, &error, &length) < 0)
				goto bail;
			if (error)
				goto bail;
		}
		else
			goto bail;
	}
	fcntl(the->connection, F_SETFL, flag);
	c_signal(SIGPIPE, SIG_DFL);
}
#endif
	return;
bail:
	fxDisconnect(the);
}

void fxDisconnect(txMachine* the)
{
#if mxWindows
	if (the->connection != INVALID_SOCKET) {
		closesocket(the->connection);
		the->connection = INVALID_SOCKET;
	}
	WSACleanup();
#else
	if (the->connection >= 0) {
		close(the->connection);
		the->connection = -1;
	}
#endif
}

txBoolean fxIsConnected(txMachine* the)
{
	return (the->connection != mxNoSocket) ? 1 : 0;
}

txBoolean fxIsReadable(txMachine* the)
{
	return 0;
}

void fxReceive(txMachine* the)
{
	int count;
	if (the->connection != mxNoSocket) {
#if mxWindows
		count = recv(the->connection, the->debugBuffer, sizeof(the->debugBuffer) - 1, 0);
		if (count < 0)
			fxDisconnect(the);
		else
			the->debugOffset = count;
#else
	again:
		count = read(the->connection, the->debugBuffer, sizeof(the->debugBuffer) - 1);
		if (count < 0) {
			if (errno == EINTR)
				goto again;
			else
				fxDisconnect(the);
		}
		else
			the->debugOffset = count;
#endif
	}
	the->debugBuffer[the->debugOffset] = 0;
}

void fxSend(txMachine* the, txBoolean more)
{
	if (the->connection != mxNoSocket) {
#if mxWindows
		if (send(the->connection, the->echoBuffer, the->echoOffset, 0) <= 0)
			fxDisconnect(the);
#else
	again:
		if (write(the->connection, the->echoBuffer, the->echoOffset) <= 0) {
			if (errno == EINTR)
				goto again;
			else
				fxDisconnect(the);
		}
#endif
	}
}

#endif /* mxDebug */

static int fxReadNetString(FILE *inStream, char** dest, size_t* len)
{
	int code = 0;
	char* buf = NULL;

	if (fscanf(inStream, "%9lu", len) < 1) {
		/* >999999999 bytes is bad */
		code = 1;
	} else if (fgetc(inStream) != ':') {
		code = 2;
	} else {
		buf = malloc(*len + 1); /* malloc(0) is not portable */
		if (!buf) {
			code = 3;
		} else if (fread(buf, 1, *len, inStream) < *len) {
			code = 4;
		} else if (fgetc(inStream) != ',') {
			code = 5;
		} else {
			*(buf + *len) = 0;
		}
		if (code != 0) {
			free(buf);
		}
		*dest = buf;
	}
	return code;
}

static char* fxReadNetStringError(int code)
{
	switch (code) {
	case 0: return "OK";
	case 1: return "Cannot read netstring, reading length prefix, fscanf";
	case 2: return "Cannot read netstring, invalid delimiter or end of file, fgetc";
	case 3: return "Cannot read netstring, cannot allocate message buffer, malloc";
	case 4: return "Cannot read netstring, cannot read message body, fread";
	case 5: return "Cannot read netstring, cannot read trailer, fgetc";
	default: return "Cannot read netstring";
	}
}

static int fxWriteOkay(FILE* outStream, xsUnsignedValue meterIndex, char* buf, size_t length) {
	char prefix[32];
	// Prepend the meter usage to the reply.
	snprintf(prefix, sizeof(prefix) - 1, ".%u\1", meterIndex);
	return fxWriteNetString(outStream, prefix, buf, length);
}

static int fxWriteNetString(FILE* outStream, char* prefix, char* buf, size_t length)
{
	if (fprintf(outStream, "%lu:%s", length + strlen(prefix), prefix) < 1) {
		return 1;
	} else if (fwrite(buf, 1, length, outStream) < length) {
		return 2;
	} else if (fputc(',', outStream) == EOF) {
		return 3;
	} else if (fflush(outStream) < 0) {
		return 4;
	}

	return 0;
}

static char* fxWriteNetStringError(int code)
{
	switch (code) {
	case 0: return "OK";
	case 1: return "Cannot write netstring, error writing length prefix";
	case 2: return "Cannot write netstring, error writing message body";
	case 3: return "Cannot write netstring, error writing terminator";
	case 4: return "Cannot write netstring, error flushing stream, fflush";
	default: return "Cannot write netstring";
	}
}

static void fx_issueCommand(xsMachine *the)
{
	int argc = xsToInteger(xsArgc);
	if (argc < 1) {
		mxTypeError("expected ArrayBuffer");
	}

	size_t length;
	char* buf = NULL;
	txSlot* arrayBuffer = &xsArg(0);
	length = fxGetArrayBufferLength(the, arrayBuffer);

	buf = malloc(length);

	fxGetArrayBufferData(the, arrayBuffer, 0, buf, length);
	int writeError = fxWriteNetString(toParent, "?", buf, length);

	free(buf);

	if (writeError != 0) {
		xsUnknownError(fxWriteNetStringError(writeError));
	}

	// read netstring
	size_t len;
	int readError = fxReadNetString(fromParent, &buf, &len);
	if (readError != 0) {
		xsUnknownError(fxReadNetStringError(readError));
	}

	xsResult = xsArrayBuffer(buf, len);
}

// Local Variables:
// tab-width: 4
// c-basic-offset: 4
// indent-tabs-mode: t
// End:
// vim: noet ts=4 sw=4
