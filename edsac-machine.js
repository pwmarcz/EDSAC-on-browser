
// Object representing the EDSAC machine. If need be, this
// can be converted into a JavaScript 'class', but right now
//  we need only one.
edsac.machine = {};

// 512 words of 35 bits
edsac.machine.MEM_SIZE = 512;

// Reset the machine state
edsac.machine.init = function() {
    this.mem = new Array(this.MEM_SIZE);

    for (var i = 0; i < this.mem.length; ++i)
        this.mem[i] = edsac.zeroValue(35);

    // Instruction pointer (SCR)
    this.ip = 0;

    // 71-bit accumulator
    this.abc = edsac.zeroValue(71);
    // its senior 35 bits
    this.ab = this.abc.slice(36, 35);
    // its senior 17 bits
    this.a = this.abc.slice(54, 17);

    // 35-bit multiplier
    this.rs = edsac.zeroValue(35);
    // its senior 17 bits
    this.r = this.rs.slice(18, 17);

    this.input = '';
    this.output = new edsac.Printer();
    this.lastOutput = 0;

    this.running = true;
};

edsac.machine.reset = function() {
    this.setIp(0);
    this.setAccum(2, edsac.zeroValue(71));
    this.setMult(1, edsac.zeroValue(35));
    for (var i = 0; i < this.MEM_SIZE; ++i)
        this.set(2*i, 1, edsac.zeroValue(35));
    this.lastOutput = 0;
    this.running = true;
};

// Memory getters and setters: w[2n], m[2n or 2n+1]
// No other method should mutate the values acquired by get

edsac.machine.get = function(addr, wide) {
    if (Math.round(addr) != addr ||
        (wide && (addr % 2 != 0)) ||
        addr < 0 ||
        addr >= 2*this.MEM_SIZE)

        throw 'wrong memory address';

    var word = this.mem[(addr - addr % 2)/2];
    if (wide)
        return word;
    else {
        if (addr % 2 == 0)
            return word.slice(0, 17);
        else
            return word.slice(18, 17);
    }
};

edsac.machine.set = function(addr, wide, value) {
    if (value.n != (wide ? 35 : 17))
        throw 'wrong value width';

    var v = this.get(addr, wide);
    if (v.compare(value) == 0)
        return;

    v.assign(value);

    if (edsac.gui && edsac.gui.active) {
        edsac.gui.onSet(addr);
        if (wide)
            edsac.gui.onSet(addr+1);
    }
};

// Accumulator getters and setters,
// accept 0, 1, 2 for A, AB, ABC respectively

edsac.machine.getAccum = function(mode) {
    if (mode == 0)
        return this.a;
    else if (mode == 1)
        return this.ab;
    else
        return this.abc;
};

edsac.machine.setAccum = function(mode, value) {
    if (value.n != (mode == 2 ? 71 :
                    mode == 1 ? 35 :
                    17))
        throw 'wrong value width';

    this.getAccum(mode).assign(value);
};

// Multiplier getters and setters,
// accept 0 for R, 1 for RS

edsac.machine.getMult = function(mode) {
    if (mode == 0)
        return this.r;
    else
        return this.rs;
};

edsac.machine.setMult = function(mode, value) {
    if (value.n != (mode ? 35 : 17))
        throw 'wrong value width';

    this.getMult(mode).assign(value);
};

edsac.machine.setInput = function(s) {
    this.input = s;
    if (edsac.gui && edsac.gui.active)
        edsac.gui.onSetInput(s);
};

edsac.machine.setIp = function(ip) {
    var oldIp = this.ip;
    this.ip = ip;
    if (edsac.gui && edsac.gui.active)
        edsac.gui.onSetIp(oldIp, ip);
};

edsac.machine.readNum = function(s) {
    if (this.input.length == 0)
        throw 'empty input tape';
    var c = this.input.charAt(0);
    this.setInput(this.input.substr(1));
    return edsac.numFromChar(c);
};

edsac.machine.writeNum = function(num) {
    this.output.writeNum(num);
    this.lastOutput = num;
    if (edsac.gui && edsac.gui.active)
        edsac.gui.onSetOutput(this.output.getText());
};

// for the Y order (round)
edsac.machine.BIT_35 = edsac.zeroValue('71');
edsac.machine.BIT_35.set(35, 1);

// Perform one step of execution
edsac.machine.step = function() {
    var orderVal = this.get(this.ip, 0);
    var order = orderVal.getOrder();
    var op = order[0];
    var addr = order[1];
    var mode = (order[2] ? 1 : 0);

    var newIp = this.ip + 1;

    switch (op) {
    case 'A': // A/AB += mem
        this.setAccum(mode, this.getAccum(mode).add(this.get(addr, mode)));
        break;
    case 'S': // A/AB -= mem
        this.setAccum(mode, this.getAccum(mode).sub(this.get(addr, mode)));
        break;
    case 'H': // R/RS = mem
        //this.setMult(mode, this.getMult(mode).add(this.get(addr, mode)));
        this.setMult(mode, this.get(addr, mode));
        break;
    case 'V': { // AB/ABC += mem * R/RS
        var v = this.get(addr, mode).mult(this.getMult(mode));
        // extend by 1 bit
        v = v.copy(v.n+1);
        this.setAccum(mode+1, this.getAccum(mode+1).add(v.shiftLeft(2)));
        break;
    }
    case 'N': { // AB/ABC -= mem * R/RS
        var v = this.get(addr, mode).mult(this.getMult(mode));
        // extend by 1 bit
        v = v.copy(v.n+1);
        this.setAccum(mode+1, this.getAccum(mode+1).sub(v.shiftLeft(2)));
        break;
    }
    case 'U': // mem = A/AB
        this.set(addr, mode, this.getAccum(mode));
        break;
    case 'T': // mem = A/AB; ABC = 0
        this.set(addr, mode, this.getAccum(mode));
        this.setAccum(2, edsac.zeroValue(71));
        break;
    case 'C': // A/AB += mem & R/RS
        this.setAccum(mode, this.getAccum(mode).add(
                          this.get(addr, mode).and(this.getMult(mode))));
        break;
    case 'R':
    case 'L': { // shift left/right
        // Find rightmost 1-bit
        var i = 0;
        while (orderVal.get(i) == 0)
            i++;
        if (op == 'L')
            this.setAccum(2, this.getAccum(2).shiftLeft(i+1));
        else
            this.setAccum(2, this.getAccum(2).shiftArithmeticRight(i+1));
        break;
    }
    case 'E': // if A >= 0 goto N
        if (this.getAccum(2).signBit() == 0)
            newIp = addr;
        break;
    case 'G': // if A < 0 goto N
        if (this.getAccum(2).signBit() == 1)
            newIp = addr;
        break;
    case 'I': { // read character into 5 lowest bits of m[N]
                // or 5 middle bits of w[N]
        var num = this.readNum();
        if (mode == 0)
            this.set(addr, 0, edsac.valueFromInteger(num, 17));
        else
            this.set(addr, 1, edsac.valueFromInteger(num, 35).shiftLeft(18));
        break;
    }
    case 'O': { // output 5 highest bits of m[N]/w[N] as character
        var val;
        if (mode == 0)
            val = this.get(addr, 0).slice(12, 5);
        else
            val = this.get(addr, 1).slice(30, 5);
        this.writeNum(val.toInteger(false));
        break;
    }
    case 'F': { // load last output to memory
        var val;
        if (mode == 0)
            val = edsac.valueFromInteger(this.lastOutput, 17).shiftLeft(12);
        else
            val = edsac.valueFromInteger(this.lastOutput, 35).shiftLeft(30);
        this.set(addr, mode, val);
        break;
    }
    case 'X': // no operation
        break;
    case 'Y': // ABC += {1 at bit 35} (34 counting from the left)
        this.setAccum(2, this.getAccum(2).add(this.BIT_35));
        break;
    case 'Z': // stop
        this.running = false;
        break;
    default:
        throw 'malformed order: '+orderVal.printOrder();
    }

    this.setIp(newIp);
};

// A quick version of the 'initial orders 1' - load all orders from tape.
edsac.machine.loadInput = function() {
    var addr = 31;
    while (this.input != '') {
        var m = this.input.match(/^(.\d*[LS])/);
        if (m == null)
            throw 'malformed input';
        var order = m[1];
        this.setInput(this.input.substr(order.length));
        this.set(addr, false, edsac.valueFromOrder(order));
        addr++;
    }
    this.setIp(31);
};
