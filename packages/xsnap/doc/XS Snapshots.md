# XS Snapshots
Revised: September 24, 2020

Warning: These notes are preliminary. Omissions and errors are likely. If you encounter problems, please ask for assistance.

## Format

XS snapshots are atom based. Inside the `XS_M` container, there are nine atoms:

- `VERS`: The version of XS and the architecture.
- `SIGN`: The runtime signature.
- `CREA`: The parameters to create the machine: block initial and incremental size, heap initial and incremental size, stack size, etc.
- `BLOC`: The chunks in the blocks.
- `HEAP`: The slots in the heaps.
- `STAC`: The slots in the stack.
- `KEYS`: The keys table.
- `NAME`: The names table.
- `SYMB`: The symbols table.

XS snapshots are bound to:

- the major and minor version numbers of XS,
- the architecture: 32-bit vs 64-bit, big endian vs little endian,
- the runtime signature.

## Programming Interface

The `xsSnapshot` structure is used to read and write snapshots.

	typedef struct {
		char* signature;
		int signatureLength;
		xsCallback* callbacks;
		int callbacksLength;
		int (*read)(void* stream, void* ptr, size_t size);
		int (*write)(void* stream, void* ptr, size_t size);
		void* stream;
		int error;
		void* data[3];
	} xsSnapshot;


- `signature`: bytes to identify the runtime.
- `signatureLength`: the number of bytes in `signature`.
- `callbacks`: array of XS callbacks implemented by the runtime.
- `callbacksLength`: the number of XS callbacks in `callbacks`.
- `read`: the function that `xsReadSnapshot` will call to read the snapshot.
- `write`: the function that `xsWriteSnapshot` will call to write the snapshot.
- `stream`: the parameter passed to the `read` and `write` functions.
- `error`: the error that occurred when reading or writing the snapshot.
- `data`: pointers used internally by XS, must be set to `NULL`.

The `signature` and `callbacks` fields are related. Runtimes must change the `signature` if the `callbacks` become incompatible.

If the `stream` is a binary `FILE*`, the `read` and `write` functions are trivial:

	int read(void* stream, void* ptr, size_t size)
	{
		return (fread(ptr, size, 1, stream) == 1) ? 0 : errno;
	}

	int write(void* stream, void* ptr, size_t size)
	{
		return (fwrite(ptr, size, 1, stream) == 1) ? 0 : errno;
	}

### Writing Snapshot

Here is the typical runtime sequence:

- create a new machine,
- run modules or scripts,
- wait for all jobs to complete,
- write the snapshot.

To write the snapshot, fill the `xsSnapshot` structure and call  `xsWriteSnapshot`.

	extern int xsWriteSnapshot(xsMachine* the, xsSnapshot* snapshot);

- `xsWriteSnapshot` must be called outside of XS callbacks and outside of `xsBeginHost` `xsEndHost` blocks.
- There must be no host instances.

`xsWriteSnapshot` returns `1` if successful, otherwise `xsWriteSnapshot` returns `0` and sets the `error` field.

### Reading Snapshot

Once you have a snapshot, instead of creating a new machine with `xsCreateMachine`, you can create a new machine with `xsReadSnapshot`. The new machine will be in the same state as the machine that was saved by `xsWriteSnapshot`.

To read the snapshot, fill the `xsSnapshot` structure and call  `xsReadSnapshot`.

	xsMachine* xsReadSnapshot(xsSnapshot* snapshot, xsStringValue name, void* context);

- `snapshot`: The snapshot structure.
- `name`: The name of the machine to be displayed in **xsbug**.
- `context`: The initial context of the machine, or `NULL`

`xsReadSnapshot` returns a machine if successful, otherwise `xsReadSnapshot` returns `NULL` and sets the `error` field.

## Implementation Details

To be able to write a snapshot, everything must be in chunk blocks, slot heaps and slot stack. There cannot be pointers to host data.

That was mostly the case, except for a few optimizations that create JS strings pointing to C data. Such optimizations are now skipped if `mxSnapshot` is defined. We should investigate if such optimizations are still necessary.

Interestingly enough snapshots are completely orthogonal to the shared machine prepared by the XS linker to flash micro-controllers. The strategy there is to have as many pointers to host data as possible...

### Callbacks

The only pointers that cannot be avoided are XS callbacks, i.e. pointers to host code.

The major and minor version numbers of XS change when byte codes evolve and when built-ins get new features. New features are always implemented with new callbacks.

Snapshots are obviously bound to major and minor version numbers of XS. For the sake of snapshots, XS maintains an array of callbacks. It is then enough to project XS callbacks into array indexes.

Similarly, thanks to a signature and an array of callbacks, runtimes can add new callbacks that will be projected into array indexes.

### Strictly Deterministic

If two machines with the same allocations perform the same operations with the same results in the same order, their snapshots will be the same.

The XS garbage collector is always complete and introduces no variations.

But asynchronous features can of course alter the order. Then the snapshots will not be the same, even if they are functionally equivalent.

### Tests

A lot of tests remain to be done to verify how various built-ins survive the snapshot process.








