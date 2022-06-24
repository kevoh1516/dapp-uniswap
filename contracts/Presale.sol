//SPDX-License-Identifier: Unlicense
pragma solidity ~0.6.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract Presale is AccessControl {
    using Counters for Counters.Counter;
    Counters.Counter private _presaleIds;

    using SafeERC20 for IERC20;
    IERC20 private tokenContract;

    IUniswapV2Router02 private router;

    uint256 public usageFeeBIP;
    uint256 public totalUsageFees;

    address routerAddr;

    struct PresaleData {
        address owner;
        uint256 start;
        uint256 end;
        uint256 price;
        uint256 amountLeft;
        uint256 amount;
        uint256 eth;
        address token;
        bool ended;
    }

    mapping(uint256 => PresaleData) public allPresales;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    event StartPresale(
        address starter,
        uint256 presaleId,
        uint256 start,
        uint256 end,
        uint256 price,
        uint256 amount,
        address token
    );
    event Bought(address buyer, uint256 amount, uint256 price);
    event TokenBalance(uint256 presaleId, address token, uint256 newBal);
    event EndPresale(address ender, uint256 presaleId, uint256 sold);
    event Withdraw(address withdrawer, uint256 presaleId, uint256 amount);

    constructor(
        uint256 _usageFee,
        address admin,
        address _router
    ) public {
        usageFeeBIP = _usageFee;
        _setupRole(ADMIN_ROLE, admin);
        routerAddr = _router;
        router = IUniswapV2Router02(_router);
    }

    function startPresales(
        uint256[] calldata start,
        uint256[] calldata end,
        uint256[] calldata prices,
        uint256[] calldata amount,
        address[] calldata tokens
    ) external {
        require(
            start.length == end.length &&
                start.length == prices.length &&
                start.length == amount.length &&
                start.length == tokens.length,
            "Length mismatch."
        );
        for (uint256 i = 0; i < start.length; i++) {
            require(start[i] < end[i], "End time < start time.");
            require(amount[i] > 0, "Amount must be > 0.");
            uint256 newPresaleId = _presaleIds.current();
            PresaleData memory presale = PresaleData(
                msg.sender,
                start[i],
                end[i],
                prices[i],
                amount[i],
                amount[i],
                0,
                tokens[i],
                false
            );
            allPresales[newPresaleId] = presale;
            _presaleIds.increment();

            tokenContract = IERC20(tokens[i]);
            tokenContract.safeTransferFrom(
                msg.sender,
                address(this),
                amount[i]
            );

            emit StartPresale(
                msg.sender,
                newPresaleId,
                start[i],
                end[i],
                prices[i],
                amount[i],
                tokens[i]
            );
        }
    }

    function buy(uint256 presaleId, uint256 amount) external payable {
        PresaleData storage presale = allPresales[presaleId];
        require(presale.amount > 0, "Invalid presale ID.");
        require(
            amount <= presale.amountLeft,
            "Not enough tokens in the reserve"
        );
        require(
            (msg.value * 10**18) / presale.price >= amount,
            "Not enough ether"
        );
        require(block.timestamp <= presale.end, "presale has already ended.");
        require(block.timestamp >= presale.start, "Presale has not started.");

        presale.eth += msg.value;
        presale.amountLeft -= amount;
        IERC20 token = IERC20(presale.token);
        token.safeTransfer(msg.sender, amount);

        emit Bought(msg.sender, amount, presale.price);
        emit TokenBalance(presaleId, presale.token, presale.amountLeft);
    }

    function endPresale(uint256 presaleId) external {
        PresaleData storage presale = allPresales[presaleId];
        require(presale.amount > 0, "Invalid presale ID.");
        require(block.timestamp > presale.end, "Presale has not ended.");
        require(!presale.ended, "Presale has already ended.");
        uint256 sold = presale.amount - presale.amountLeft;

        presale.ended = true;

        if (sold > 0) {
            IERC20 token = IERC20(presale.token);
            token.safeTransferFrom(msg.sender, address(this), sold);
            token.approve(address(router), sold);

            uint256 usageFee = (presale.eth * usageFeeBIP) / 10000;
            totalUsageFees += usageFee;
            uint256 sendEth = presale.eth - usageFee;

            router.addLiquidityETH{value: sendEth}(
                presale.token,
                sold,
                sold,
                sendEth,
                address(this),
                block.timestamp + 60
            );
        }

        emit EndPresale(msg.sender, presaleId, sold);
    }

    function withdraw(uint256 presaleId) external {
        PresaleData storage presale = allPresales[presaleId];
        require(presale.amount > 0, "Invalid presale ID.");
        require(presale.ended, "Presale has not been closed.");
        require(presale.amountLeft > 0, "No tokens left to withdraw.");
        require(
            msg.sender == presale.owner,
            "You are not the owner of the presale."
        );
        uint256 amountLeft = presale.amountLeft;
        presale.amountLeft = 0;

        IERC20 token = IERC20(presale.token);
        token.safeTransfer(msg.sender, amountLeft);

        emit Withdraw(msg.sender, presaleId, amountLeft);
    }

    function setUsageFee(uint256 usageFee) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Caller is not an admin");
        usageFeeBIP = usageFee;
    }
}
